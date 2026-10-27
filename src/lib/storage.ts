import { persistLocalFiles } from './localFiles';
import type { Message, Tab, SavedWebhook, SavedTemplate, SavedBackup } from './types';
import { uid, parseImportedDraftData } from './utils';
import { DEFAULT_APP_THEME, normalizeTheme, type AppTheme } from './themes';
import { stripTransientAttachmentsFromTabs } from './draftState';
import { makeTemporarySharedDraftsPersistent, splitTemporarySharedDrafts } from './shareDrafts';

const KEYS = {
  TABS: 'meowhook_tabs',
  TEMP_TABS: 'meowhook_temp_tabs',
  MESSAGES: 'meowhook_messages', // Legacy
  WEBHOOKS: 'meowhook_webhooks',
  TEMPLATES: 'meowhook_templates',
  BACKUPS: 'meowhook_backups',
  THEME: 'meowhook_theme',
  SIDEBAR_COLLAPSED: 'meowhook_sidebar_collapsed',
  WEBHOOK_URL: 'meowhook_webhook_url',
  RECENT_COLORS: 'meowhook_recent_colors',
  ACTIVE_DRAFT: 'meowhook_active_draft',
};

type StorageArea = 'local' | 'session';

function getStorage(area: StorageArea): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return area === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function get<T>(area: StorageArea, key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const storage = getStorage(area);
    const raw = storage?.getItem(key) ?? null;
    const value = raw ? JSON.parse(raw) : fallback;
    if (Array.isArray(fallback) && !Array.isArray(value)) return fallback;
    if (typeof fallback === 'string' && typeof value !== 'string') return fallback;
    return value;
  } catch {
    return fallback;
  }
}

/** Optional callback for storage errors — wired up by the app store. */
let onStorageError: ((message: string) => void) | null = null;

export function setStorageErrorHandler(handler: (message: string) => void) {
  onStorageError = handler;
}

function set(area: StorageArea, key: string, value: unknown): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const storage = getStorage(area);
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    // Check for quota exceeded error
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
      console.error(`Storage quota exceeded when saving ${key}`);
      onStorageError?.('Storage full — your changes may not be saved. Try clearing old drafts or backups.');
    } else {
      console.error(`Storage error for ${key}:`, e);
    }
    return false;
  }
}

function readStoredTabs(value: unknown): Tab[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((tab) => {
    try { return parseImportedDraftData(tab); } catch { return []; }
  });
}

let expectedDrafts: string | null | undefined;
export let draftSaveFailure: 'conflict' | 'error' | null = null;
export function loadTabs(): Tab[] | null {
  expectedDrafts = getStorage('local')?.getItem(KEYS.TABS) ?? null;
  draftSaveFailure = null;
  const persistedTabs = readStoredTabs(get<unknown>('local', KEYS.TABS, []));
  const sessionTabs = readStoredTabs(get<unknown>('session', KEYS.TEMP_TABS, []));

  let nextPersistedTabs = persistedTabs;
  let nextSessionTabs = sessionTabs;

  const migrated = splitTemporarySharedDrafts(persistedTabs);
  if (migrated.temporaryTabs.length > 0) {
    nextPersistedTabs = migrated.persistentTabs;
    const sessionById = new Map(nextSessionTabs.map((tab) => [tab.id, tab]));
    for (const temporaryTab of migrated.temporaryTabs) {
      if (!sessionById.has(temporaryTab.id)) {
        sessionById.set(temporaryTab.id, temporaryTab);
      }
    }
    nextSessionTabs = Array.from(sessionById.values());
    set('local', KEYS.TABS, nextPersistedTabs);
    set('session', KEYS.TEMP_TABS, nextSessionTabs);
  }

  expectedDrafts = getStorage('local')?.getItem(KEYS.TABS) ?? null;
  const combinedTabs = [...nextPersistedTabs, ...nextSessionTabs];
  if (combinedTabs.length > 0) return combinedTabs;

  // Migration: if people have old messages, convert them to a single tab
  const oldMsgs = get<Message[] | null>('local', KEYS.MESSAGES, null);
  if (oldMsgs && Array.isArray(oldMsgs) && oldMsgs.length > 0 && typeof oldMsgs[0]?.content !== 'undefined') {
    const defaultUrl = loadWebhookUrl();
    return [{ id: uid(), name: 'Legacy Draft', messages: parseImportedDraftData(oldMsgs)[0].messages, webhookUrl: defaultUrl }];
  }
  return null;
}
export async function saveTabs(tabs: Tab[]): Promise<boolean> {
  const write = async () => {
    const storage = getStorage('local');
    if (!storage) throw new Error('Browser storage is unavailable.');
    const current = storage.getItem(KEYS.TABS);
    if (expectedDrafts !== undefined && current !== expectedDrafts) {
      draftSaveFailure = 'conflict';
      return false;
    }
    await persistLocalFiles(tabs);
    if (storage.getItem(KEYS.TABS) !== current) { draftSaveFailure = 'conflict'; return false; }
    const sanitizedTabs = stripTransientAttachmentsFromTabs(tabs);
    const { persistentTabs, temporaryTabs } = splitTemporarySharedDrafts(sanitizedTabs);
    if (!set('session', KEYS.TEMP_TABS, temporaryTabs) || !set('local', KEYS.TABS, persistentTabs)) {
      draftSaveFailure = 'error';
      return false;
    }
    expectedDrafts = JSON.stringify(persistentTabs);
    draftSaveFailure = null;
    return true;
  };
  try {
    // The lock makes the comparison and write atomic across browser tabs.
    if (!navigator.locks) throw new Error('This browser cannot safely coordinate draft saves.');
    return await navigator.locks.request('meowhook-drafts', write);
  } catch {
    draftSaveFailure = 'error';
    onStorageError?.('Could not save drafts and files. Check browser storage or download a copy.');
    return false;
  }
}

export function loadWebhookUrl(): string {
  return get<string>('local', KEYS.WEBHOOK_URL, '');
}
export function saveWebhookUrl(url: string): void {
  set('local', KEYS.WEBHOOK_URL, url);
}

export function loadSavedWebhooks(): SavedWebhook[] {
  return get<SavedWebhook[]>('local', KEYS.WEBHOOKS, []);
}
export function saveSavedWebhooks(hooks: SavedWebhook[]): boolean {
  return set('local', KEYS.WEBHOOKS, hooks);
}

export const loadTheme = (): AppTheme => {
  return normalizeTheme(get('local', KEYS.THEME, DEFAULT_APP_THEME));
};
export function saveTheme(theme: string): void {
  set('local', KEYS.THEME, normalizeTheme(theme));
}

/** Selection belongs to this browser tab and survives reload without changing another tab's view. */
export const loadActiveDraftId = (): string => get<string>('session', KEYS.ACTIVE_DRAFT, '');
export function saveActiveDraftId(id: string): void { set('session', KEYS.ACTIVE_DRAFT, id); }

export const loadSidebarCollapsed = (): boolean => get<boolean>('local', KEYS.SIDEBAR_COLLAPSED, false) === true;
export function saveSidebarCollapsed(collapsed: boolean): void {
  set('local', KEYS.SIDEBAR_COLLAPSED, collapsed);
}

export function loadCustomTemplates(): SavedTemplate[] {
  return get<SavedTemplate[]>('local', KEYS.TEMPLATES, []);
}
export async function saveCustomTemplates(templates: SavedTemplate[], files: Message[] = []): Promise<boolean> {
  try { await persistLocalFiles([{ id: 'template', name: '', webhookUrl: '', messages: files }]); }
  catch { return false; }
  return set('local', KEYS.TEMPLATES, templates);
}

export function loadBackups(): SavedBackup[] {
  return get<SavedBackup[]>('local', KEYS.BACKUPS, []).map((backup) => ({
    ...backup,
    tabs: stripTransientAttachmentsFromTabs(
      makeTemporarySharedDraftsPersistent(readStoredTabs(backup?.tabs))
    ),
  }));
}
export function saveBackups(backups: SavedBackup[]): boolean {
  return set(
    'local',
    KEYS.BACKUPS,
    backups.map((backup) => ({
      ...backup,
      tabs: stripTransientAttachmentsFromTabs(makeTemporarySharedDraftsPersistent(backup.tabs)),
    }))
  );
}

export function loadRecentColors(): string[] {
  return get<string[]>('local', KEYS.RECENT_COLORS, []);
}
export function saveRecentColors(colors: string[]): void {
  const unique = [...new Set(colors)].slice(0, 20);
  set('local', KEYS.RECENT_COLORS, unique);
}
