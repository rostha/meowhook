'use client';
import { loadSendRuns, type SendRun } from '@/lib/sendHistory';
import { restoreLocalFiles } from '@/lib/localFiles';
import { draftSaveFailure } from '@/lib/storage';
import { create } from 'zustand';
import type {
  EditorFocusTarget,
  Message,
  Tab,
  WebhookInfo,
  Toast,
  Settings,
  SendProgress,
} from '@/lib/types';
import type { DiscordApiErrorPresentation } from '@/lib/discordApiError';
import { createDefaultMessage, uid } from '@/lib/utils';
import { createWelcomeDraft, upgradeUntouchedWelcomeDraft } from '@/lib/welcomeDraft';
import {
  loadTabs,
  loadActiveDraftId,
  saveActiveDraftId,
  saveTabs,
  loadTheme,
  saveTheme,
  loadSidebarCollapsed,
  saveSidebarCollapsed,
  loadWebhookUrl,
  saveWebhookUrl,
  setStorageErrorHandler,
} from '@/lib/storage';
import { DEFAULT_APP_THEME, normalizeTheme } from '@/lib/themes';
import type { RateLimitState } from '@/lib/rateLimit';
import { getRateLimitState, subscribeToRateLimit } from '@/lib/rateLimit';
import { cloneDraftHistorySnapshot, cloneTabsForHistory, type DraftHistorySnapshot } from '@/lib/draftState';
import {
  findFirstTemporarySharedDraftIndex,
  pruneExpiredTemporarySharedDrafts,
  splitTemporarySharedDrafts,
} from '@/lib/shareDrafts';

// Store timeout references for cleanup
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const MAX_DRAFT_HISTORY = 80;

function isBlobUrl(url: string | undefined): boolean {
  return typeof url === 'string' && url.startsWith('blob:');
}

function collectBlobUrlsFromMessage(message: Message, target: Set<string>): void {
  if (isBlobUrl(message.avatar_url)) {
    target.add(message.avatar_url);
  }

  message._attachments?.forEach((attachment) => {
    if (isBlobUrl(attachment.previewUrl)) {
      target.add(attachment.previewUrl);
    }
  });

  message.embeds.forEach((embed) => {
    if (isBlobUrl(embed.image?.url)) target.add(embed.image.url);
    if (isBlobUrl(embed.thumbnail?.url)) target.add(embed.thumbnail.url);
    if (isBlobUrl(embed.author?.icon_url)) target.add(embed.author.icon_url);
    if (isBlobUrl(embed.footer?.icon_url)) target.add(embed.footer.icon_url);
  });
}

function collectBlobUrlsFromTabs(tabs: Tab[]): Set<string> {
  const blobUrls = new Set<string>();
  tabs.forEach((tab) => {
    tab.messages.forEach((message) => collectBlobUrlsFromMessage(message, blobUrls));
  });
  return blobUrls;
}

function collectBlobUrlsFromSnapshots(snapshots: DraftHistorySnapshot[]): Set<string> {
  const blobUrls = new Set<string>();
  snapshots.forEach((snapshot) => {
    snapshot.tabs.forEach((tab) => {
      tab.messages.forEach((message) => collectBlobUrlsFromMessage(message, blobUrls));
    });
  });
  return blobUrls;
}

function revokeBlobUrlSet(blobUrls: Iterable<string>): void {
  for (const url of blobUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore errors from already-revoked URLs.
    }
  }
}

function collectAllReferencedBlobUrls(
  tabs: Tab[],
  past: DraftHistorySnapshot[],
  future: DraftHistorySnapshot[],
): Set<string> {
  const blobUrls = collectBlobUrlsFromTabs(tabs);
  collectBlobUrlsFromSnapshots(past).forEach((url) => blobUrls.add(url));
  collectBlobUrlsFromSnapshots(future).forEach((url) => blobUrls.add(url));
  return blobUrls;
}

function buildDraftSnapshot(tabs: Tab[], activeTabIndex: number): DraftHistorySnapshot {
  return {
    tabs: cloneTabsForHistory(tabs),
    activeTabIndex,
  };
}

function clampActiveTabIndex(index: number, tabs: Tab[]): number {
  if (tabs.length === 0) return 0;
  return Math.max(0, Math.min(index, tabs.length - 1));
}

function clampActiveMessageIndex(index: number, messages: Message[]): number {
  if (messages.length === 0) return 0;
  return Math.max(0, Math.min(index, messages.length - 1));
}

function createFallbackDraft(webhookUrl = loadWebhookUrl()): Tab {
  return {
    id: uid(),
    name: 'Draft 1',
    messages: [createDefaultMessage()],
    webhookUrl,
  };
}

function prepareTabsAfterTemporaryShareExpiry(tabs: Tab[]): { tabs: Tab[]; removedCount: number } {
  const { tabs: remainingTabs, removedCount } = pruneExpiredTemporarySharedDrafts(tabs);
  if (remainingTabs.length > 0 || removedCount === 0) {
    return { tabs: remainingTabs, removedCount };
  }

  return {
    tabs: [createFallbackDraft()],
    removedCount,
  };
}

interface AppState {
  tabs: Tab[];
  activeTabIndex: number;
  activeMessageIndex: number;
  editorFocusTarget: EditorFocusTarget | null;
  draftHistoryPast: DraftHistorySnapshot[];
  draftHistoryFuture: DraftHistorySnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  webhookInfo: WebhookInfo | null;
  settings: Settings;
  toasts: Toast[];
  sending: boolean;
  rateLimit: RateLimitState;
  sendProgress: SendProgress;
  sendRuns: Record<string, SendRun>;
  saveSendRun: (run: SendRun) => void;

  setTabs: (tabs: Tab[]) => void;
  setActiveTabIndex: (index: number) => void;
  setActiveMessageIndex: (index: number) => void;
  updateActiveTab: (fn: (tab: Tab) => Tab) => void;
  addTab: () => void;
  removeTab: (index: number) => void;
  renameTab: (index: number, name: string) => void;
  /** Reorder drafts by stable tab ids; keeps the active tab selected */
  reorderTabs: (orderedIds: string[]) => void;
  setWebhookUrl: (url: string) => void; // updates current tab
  undoDraftChange: () => void;
  redoDraftChange: () => void;
  requestEditorFocus: (target: Omit<EditorFocusTarget, 'requestId'>) => void;
  clearEditorFocus: () => void;

  // Message sequence operations (applies to active tab)
  addMessage: () => void;
  duplicateMessage: (index: number) => void;
  removeMessage: (index: number) => void;
  updateMessage: (msgIndex: number, fn: (msg: Message) => Message) => void;

  setWebhookInfo: (info: WebhookInfo | null) => void;
  setSending: (s: boolean) => void;
  setSendProgress: (progress: Partial<SendProgress>) => void;
  resetSendProgress: () => void;
  updateSettings: (s: Partial<Settings>) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  hydrate: () => Promise<void>;
  hydrated: boolean;
  saveStatus: 'saved' | 'saving' | 'error' | 'conflict';
  autoSave: () => void;
  saveNow: () => void;
  pruneExpiredTemporaryDrafts: (options?: { notify?: boolean }) => boolean;
  /** Unix ms when drafts were last written to localStorage */
  lastDraftPersistedAt: number | null;

  /** Discord API validation / error modal (same style as Discord’s own error dialogs) */
  discordErrorModal: DiscordApiErrorPresentation | null;
  showDiscordErrorModal: (payload: DiscordApiErrorPresentation) => void;
  closeDiscordErrorModal: () => void;
}

export const useAppStore = create<AppState>((set, get) => {
  let saveQueue = Promise.resolve();
  let saveGeneration = 0;
  let hydrationGeneration = 0;
  let lastQueuedTabs: Tab[] | null = null;
  let typingGroup: { element: Element; at: number; tabId: string } | null = null;
  const persist = (tabs: Tab[]) => {
    if (!get().hydrated || get().saveStatus === 'conflict') return;
    if (tabs === lastQueuedTabs && get().saveStatus !== 'error') return;
    lastQueuedTabs = tabs;
    const generation = ++saveGeneration;
    set({ saveStatus: 'saving' });
    saveQueue = saveQueue.then(async () => {
      if (generation !== saveGeneration) return;
      const ok = await saveTabs(tabs);
      if (!ok) set({ saveStatus: draftSaveFailure ?? 'error' });
      else if (generation === saveGeneration) set({ saveStatus: 'saved', lastDraftPersistedAt: Date.now() });
    }).catch(() => set({ saveStatus: 'error' }));
  };
  if (typeof document !== 'undefined') document.addEventListener('focusout', () => { typingGroup = null; });
  // Subscribe to rate limit changes
  subscribeToRateLimit((rateLimit) => {
    set({ rateLimit });
  });

  const commitTabsState = (
    nextTabs: Tab[],
    nextActiveTabIndex: number,
    options?: {
      recordHistory?: boolean;
      draftHistoryPast?: DraftHistorySnapshot[];
      draftHistoryFuture?: DraftHistorySnapshot[];
    },
  ) => {
    const {
      tabs,
      activeTabIndex,
      activeMessageIndex,
      draftHistoryPast,
      draftHistoryFuture,
    } = get();
    const recordHistory = options?.recordHistory !== false;
    const resolvedActiveTabIndex = clampActiveTabIndex(nextActiveTabIndex, nextTabs);
    const resolvedMessages = nextTabs[resolvedActiveTabIndex]?.messages ?? [];
    const resolvedActiveMessageIndex = clampActiveMessageIndex(activeMessageIndex, resolvedMessages);
    const element = typeof document === 'undefined' ? null : document.activeElement;
    const isTyping = typeof HTMLInputElement !== 'undefined' && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement);
    const tabId = nextTabs[resolvedActiveTabIndex]?.id;
    const grouped = recordHistory && isTyping && typingGroup?.element === element && typingGroup.tabId === tabId && Date.now() - typingGroup.at < 900 && draftHistoryFuture.length === 0;
    typingGroup = recordHistory && isTyping ? { element, tabId, at: Date.now() } : null;
    const nextPast =
      options?.draftHistoryPast ??
      (grouped ? draftHistoryPast : recordHistory
        ? [...draftHistoryPast, buildDraftSnapshot(tabs, activeTabIndex)].slice(-MAX_DRAFT_HISTORY)
        : draftHistoryPast);
    const nextFuture =
      options?.draftHistoryFuture ??
      (recordHistory ? [] : draftHistoryFuture);
    const previousBlobUrls = collectAllReferencedBlobUrls(tabs, draftHistoryPast, draftHistoryFuture);
    const nextBlobUrls = collectAllReferencedBlobUrls(nextTabs, nextPast, nextFuture);
    const releasedBlobUrls = [...previousBlobUrls].filter((url) => !nextBlobUrls.has(url));


    set({
      tabs: nextTabs,
      activeTabIndex: resolvedActiveTabIndex,
      activeMessageIndex: resolvedActiveMessageIndex,
      draftHistoryPast: nextPast,
      draftHistoryFuture: nextFuture,
      canUndo: nextPast.length > 0,
      canRedo: nextFuture.length > 0,

    });

    persist(nextTabs);
    saveActiveDraftId(nextTabs[resolvedActiveTabIndex]?.id || '');
    revokeBlobUrlSet(releasedBlobUrls);
  };

  return {
  tabs: [{ id: uid(), name: 'Draft 1', messages: [createDefaultMessage()], webhookUrl: '' }],
  activeTabIndex: 0,
  activeMessageIndex: 0,
  editorFocusTarget: null,
  draftHistoryPast: [],
  draftHistoryFuture: [],
  canUndo: false,
  canRedo: false,
  webhookInfo: null,
  settings: { theme: DEFAULT_APP_THEME, sidebarCollapsed: false },
    toasts: [],
    sending: false,
    sendRuns: {},
    saveSendRun: (run) => {
      const runs = { ...get().sendRuns, [run.draftId]: run };
      set({ sendRuns: runs });
      try { localStorage.setItem('meowhook_send_results', JSON.stringify(runs)); }
      catch { get().showToast('Send results are visible here but could not be saved in this browser.', 'error'); }
    },
    rateLimit: getRateLimitState(),
    sendProgress: {
      totalMessages: 0,
      currentMessage: 0,
      totalBatches: 0,
      currentBatch: 0,
      isWaiting: false,
      waitSeconds: 0,
      status: 'idle',
      error: null,
    },
    lastDraftPersistedAt: null,
    hydrated: false,
    saveStatus: 'saved',
    discordErrorModal: null,

  showDiscordErrorModal: (payload) => set({ discordErrorModal: payload }),
  closeDiscordErrorModal: () => set({ discordErrorModal: null }),

  setTabs: (tabs) => {
    const current = get().tabs;
    if (tabs.some(t => t.messages.some(m => m._attachments?.some(a => a.fileId && !a.file)))) {
      void restoreLocalFiles(tabs).catch(() => tabs).then(restored => {
        if (get().tabs === current) commitTabsState(restored, clampActiveTabIndex(get().activeTabIndex, restored));
      });
    } else commitTabsState(tabs, clampActiveTabIndex(get().activeTabIndex, tabs));
  },
  setActiveTabIndex: (index) =>
    set((state) => {
      const nextActiveTabIndex = clampActiveTabIndex(index, state.tabs);
      const nextMessages = state.tabs[nextActiveTabIndex]?.messages ?? [];
        saveActiveDraftId(state.tabs[nextActiveTabIndex]?.id || '');
      return {
        activeTabIndex: nextActiveTabIndex,
        activeMessageIndex: clampActiveMessageIndex(state.activeMessageIndex, nextMessages),
      };
    }),
  setActiveMessageIndex: (index) =>
    set((state) => ({
      activeMessageIndex: clampActiveMessageIndex(index, state.tabs[state.activeTabIndex]?.messages ?? []),
    })),
  updateActiveTab: (fn) => {
    const { tabs, activeTabIndex } = get();
    // Bounds check to prevent errors if tabs are modified during operations
    if (activeTabIndex < 0 || activeTabIndex >= tabs.length) {
      console.error(`updateActiveTab: invalid index ${activeTabIndex} for ${tabs.length} tabs`);
      return;
    }
    const currentTab = tabs[activeTabIndex];
    const nextTab = fn(currentTab);
    if (nextTab === currentTab) {
      return;
    }
    const updated = [...tabs];
    updated[activeTabIndex] = nextTab;
    commitTabsState(updated, activeTabIndex);
  },
  addTab: () => {
    const { tabs, activeTabIndex } = get();
    if (tabs.length >= 10) {
      get().showToast('Draft limit reached (10 drafts maximum)', 'error');
      return;
    }
    const prevUrl = tabs[activeTabIndex]?.webhookUrl || '';
    const insertionIndex = findFirstTemporarySharedDraftIndex(tabs);
    const { persistentTabs } = splitTemporarySharedDrafts(tabs);
    const updated = [...tabs];
    updated.splice(insertionIndex, 0, {
      id: uid(),
      name: `Draft ${persistentTabs.length + 1}`,
      messages: [createDefaultMessage()],
      webhookUrl: prevUrl,
    });
    commitTabsState(updated, insertionIndex);
  },
  removeTab: (index) => {
    const { tabs, activeTabIndex } = get();
    if (tabs.length <= 1 || index < 0 || index >= tabs.length) return;
    const updated = tabs.filter((_, i) => i !== index);
    commitTabsState(updated, Math.min(activeTabIndex, updated.length - 1));
  },
  renameTab: (index, name) => {
    const { tabs } = get();
    if (index < 0 || index >= tabs.length) return;
    const trimmed = name.trim().slice(0, 120);
    const nextName = trimmed || `Draft ${index + 1}`;
    if (tabs[index].name === nextName) {
      return;
    }
    const updated = [...tabs];
    updated[index] = { ...updated[index], name: nextName };
    commitTabsState(updated, get().activeTabIndex);
  },
  reorderTabs: (orderedIds) => {
    const { tabs, activeTabIndex } = get();
    if (orderedIds.length !== tabs.length) return;
    const byId = new Map(tabs.map((t) => [t.id, t]));
    const next: typeof tabs = [];
    for (const id of orderedIds) {
      const t = byId.get(id);
      if (!t) return;
      next.push(t);
    }
    const activeId = tabs[activeTabIndex]?.id;
    const newActiveIndex =
      activeId != null ? Math.max(0, next.findIndex((t) => t.id === activeId)) : 0;
    commitTabsState(next, newActiveIndex);
  },
  setWebhookUrl: (url) => {
    get().updateActiveTab((tab) => ({ ...tab, webhookUrl: url }));
    saveWebhookUrl(url); // Also save globally as default for new sessions
  },
  requestEditorFocus: (target) =>
    set({
      activeMessageIndex: target.messageIndex,
      editorFocusTarget: { ...target, requestId: uid() },
    }),
  clearEditorFocus: () => set({ editorFocusTarget: null }),
  undoDraftChange: () => {
    const { draftHistoryPast, draftHistoryFuture, tabs, activeTabIndex } = get();
    if (draftHistoryPast.length === 0) {
      return;
    }

    const previousSnapshot = cloneDraftHistorySnapshot(draftHistoryPast[draftHistoryPast.length - 1]);
    const nextPast = draftHistoryPast.slice(0, -1);
    const nextFuture = [
      buildDraftSnapshot(tabs, activeTabIndex),
      ...draftHistoryFuture,
    ].slice(0, MAX_DRAFT_HISTORY);

    commitTabsState(previousSnapshot.tabs, previousSnapshot.activeTabIndex, {
      recordHistory: false,
      draftHistoryPast: nextPast,
      draftHistoryFuture: nextFuture,
    });
  },
  redoDraftChange: () => {
    const { draftHistoryPast, draftHistoryFuture, tabs, activeTabIndex } = get();
    if (draftHistoryFuture.length === 0) {
      return;
    }

    const nextSnapshot = cloneDraftHistorySnapshot(draftHistoryFuture[0]);
    const nextPast = [...draftHistoryPast, buildDraftSnapshot(tabs, activeTabIndex)].slice(-MAX_DRAFT_HISTORY);
    const remainingFuture = draftHistoryFuture.slice(1);

    commitTabsState(nextSnapshot.tabs, nextSnapshot.activeTabIndex, {
      recordHistory: false,
      draftHistoryPast: nextPast,
      draftHistoryFuture: remainingFuture,
    });
  },

  addMessage: () => {
    const nextIndex = get().tabs[get().activeTabIndex]?.messages.length ?? 0;
    get().updateActiveTab((tab) => {
      if (tab.messages.length >= 10) return tab;
      return { ...tab, messages: [...tab.messages, createDefaultMessage()] };
    });
    get().setActiveMessageIndex(nextIndex);
  },
  duplicateMessage: (index) => {
    const { tabs, activeTabIndex } = get();
    const messages = tabs[activeTabIndex]?.messages ?? [];
    const safeIndex = clampActiveMessageIndex(index, messages);
    const source = messages[safeIndex];
    if (!source || messages.length >= 10) return;

    get().updateActiveTab((tab) => ({
      ...tab,
      messages: [
        ...tab.messages.slice(0, safeIndex + 1),
        {
          ...structuredClone(source),
          id: uid(),
          embeds: source.embeds.map((embed) => ({
            ...structuredClone(embed),
            id: uid(),
            fields: embed.fields.map((field) => ({ ...field, id: uid() })),
          })),
        },
        ...tab.messages.slice(safeIndex + 1),
      ],
    }));
    get().setActiveMessageIndex(safeIndex + 1);
  },
  removeMessage: (index) => {
    get().updateActiveTab((tab) => {
      if (tab.messages.length <= 1) return tab;
      return { ...tab, messages: tab.messages.filter((_, i) => i !== index) };
    });
    const nextMessages = get().tabs[get().activeTabIndex]?.messages ?? [];
    get().setActiveMessageIndex(Math.max(0, Math.min(index - 1, nextMessages.length - 1)));
  },
  updateMessage: (msgIndex, fn) => {
    get().updateActiveTab((tab) => {
      const updatedMessages = [...tab.messages];
      updatedMessages[msgIndex] = fn(updatedMessages[msgIndex]);
      return { ...tab, messages: updatedMessages };
    });
  },

  setWebhookInfo: (webhookInfo) => set({ webhookInfo }),
  setSending: (sending) => set({ sending }),
  setSendProgress: (progress) => set((state) => ({
    sendProgress: { ...state.sendProgress, ...progress },
  })),
  resetSendProgress: () => set({
    sendProgress: {
      totalMessages: 0,
      currentMessage: 0,
      totalBatches: 0,
      currentBatch: 0,
      isWaiting: false,
      waitSeconds: 0,
      status: 'idle',
      error: null,
    },
  }),
  updateSettings: (s) => {
    const { settings } = get();
    const next = { ...settings, ...s };
    if (s.theme !== undefined) {
      next.theme = normalizeTheme(s.theme);
    }
    set({ settings: next });
    if (s.theme !== undefined) {
      saveTheme(next.theme);
      if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', next.theme);
    }
    if (s.sidebarCollapsed !== undefined) saveSidebarCollapsed(s.sidebarCollapsed);
  },
  showToast: (message, type) => {
    const toast: Toast = { id: uid(), message, type };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    // Clear any existing timeout for this toast ID (shouldn't happen, but be safe)
    if (toastTimeouts.has(toast.id)) {
      clearTimeout(toastTimeouts.get(toast.id));
    }
    const timeout = setTimeout(() => {
      toastTimeouts.delete(toast.id);
      get().removeToast(toast.id);
    }, 4000);
    toastTimeouts.set(toast.id, timeout);
  },
  removeToast: (id) => {
    // Clear the timeout when removing toast manually
    if (toastTimeouts.has(id)) {
      clearTimeout(toastTimeouts.get(id));
      toastTimeouts.delete(id);
    }
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  pruneExpiredTemporaryDrafts: (options) => {
    const { tabs, activeTabIndex } = get();
    const { tabs: nextTabs, removedCount } = prepareTabsAfterTemporaryShareExpiry(tabs);
    if (removedCount === 0) {
      return false;
    }

    commitTabsState(nextTabs, clampActiveTabIndex(activeTabIndex, nextTabs), {
      recordHistory: false,
    });

    if (options?.notify) {
      get().showToast(
        removedCount === 1
          ? 'A temporary shared draft expired and was removed.'
          : `${removedCount} temporary shared drafts expired and were removed.`,
        'info',
      );
    }

    return true;
  },
  hydrate: async () => {
    const hydration = ++hydrationGeneration;
    ++saveGeneration;
    await saveQueue;
    set({ hydrated: false });
    typingGroup = null;
    lastQueuedTabs = null;
    // Wire up storage error handler to show toasts
    setStorageErrorHandler((msg) => get().showToast(msg, 'error'));

    let savedTabs = loadTabs();
    if (savedTabs) {
      try { savedTabs = await restoreLocalFiles(savedTabs); }
      catch { get().showToast('Uploaded files could not be restored. Re-upload missing files before sending.', 'error'); }
    }
    if (hydration !== hydrationGeneration) return;
    const theme = loadTheme();
    
    // Auto-fix empty tabs if someone manually broke their local storage
    let finalTabs = savedTabs;
    let expiredDraftCount = 0;
    if (!finalTabs || finalTabs.length === 0) {
      finalTabs = [createWelcomeDraft(loadWebhookUrl())];
    } else {
      const pruned = prepareTabsAfterTemporaryShareExpiry(finalTabs);
      finalTabs = pruned.tabs;
      expiredDraftCount = pruned.removedCount;
      // Ensure all tabs have at least one message and an ID
      finalTabs = finalTabs.map((t, i) => ({
        ...t,
        id: t.id || uid(),
        name: t.name || `Draft ${i + 1}`,
        webhookUrl: t.webhookUrl || '',
        messages: Array.isArray(t.messages) && t.messages.length > 0 ? t.messages : [createDefaultMessage()]
      }));
    }

    const previousTabs = finalTabs;
    const refreshedTabs = previousTabs.map(upgradeUntouchedWelcomeDraft);
    const refreshedWelcome = refreshedTabs.some((tab, index) => tab !== previousTabs[index]);
    finalTabs = refreshedTabs;

    const safeTheme = normalizeTheme(theme);
    const restoredActiveIndex = finalTabs.findIndex(tab => tab.id === loadActiveDraftId());
    set({
      sendRuns: loadSendRuns(),
      hydrated: true,
      saveStatus: 'saved',
      tabs: finalTabs,
      activeTabIndex: restoredActiveIndex >= 0 ? restoredActiveIndex : clampActiveTabIndex(get().activeTabIndex, finalTabs),
      activeMessageIndex: 0,
      editorFocusTarget: null,
      draftHistoryPast: [],
      draftHistoryFuture: [],
      canUndo: false,
      canRedo: false,
      settings: { theme: safeTheme, sidebarCollapsed: loadSidebarCollapsed() },
      ...(expiredDraftCount > 0 || refreshedWelcome ? { lastDraftPersistedAt: Date.now() } : {}),
    });
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', safeTheme);
    }
    if (expiredDraftCount > 0 || refreshedWelcome) {
      persist(finalTabs);
    }
    if (expiredDraftCount > 0) {
      get().showToast(
        expiredDraftCount === 1
          ? 'A temporary shared draft expired and was removed.'
          : `${expiredDraftCount} temporary shared drafts expired and were removed.`,
        'info',
      );
    }
  },
  autoSave: () => {
    if (get().pruneExpiredTemporaryDrafts({ notify: true })) {
      return;
    }
    persist(get().tabs);
  },
  saveNow: () => {
    if (get().pruneExpiredTemporaryDrafts()) {
      return;
    }
    persist(get().tabs);
  },
  };
});
