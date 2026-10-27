import type { Message, Tab } from './types';
import { uid } from './utils';

export type SharedDraftInsertResult =
  | {
      tabs: Tab[];
      activeTabIndex: number;
      mode: 'replaced-empty' | 'reused-empty' | 'added';
    }
  | {
      error: string;
    };

export function isTemporarySharedDraft(tab: Tab): boolean {
  return (
    tab.isTemporarySharedDraft === true ||
    (typeof tab.temporaryShareExpiresAt === 'number' && Number.isFinite(tab.temporaryShareExpiresAt))
  );
}

export function isTemporarySharedDraftExpired(tab: Tab, now = Date.now()): boolean {
  return typeof tab.temporaryShareExpiresAt === 'number' && Number.isFinite(tab.temporaryShareExpiresAt) && tab.temporaryShareExpiresAt <= now;
}

export function getTemporarySharedDraftRemainingMs(tab: Tab, now = Date.now()): number | null {
  if (typeof tab.temporaryShareExpiresAt !== 'number' || !Number.isFinite(tab.temporaryShareExpiresAt)) {
    return null;
  }

  return Math.max(0, tab.temporaryShareExpiresAt! - now);
}

export function splitTemporarySharedDrafts(tabs: Tab[]): {
  persistentTabs: Tab[];
  temporaryTabs: Tab[];
} {
  const persistentTabs: Tab[] = [];
  const temporaryTabs: Tab[] = [];

  for (const tab of tabs) {
    if (isTemporarySharedDraft(tab)) {
      temporaryTabs.push(tab);
    } else {
      persistentTabs.push(tab);
    }
  }

  return { persistentTabs, temporaryTabs };
}

export function makeTemporarySharedDraftsPersistent(tabs: Tab[]): Tab[] {
  return tabs.map((tab) => {
    if (!isTemporarySharedDraft(tab)) {
      return tab;
    }

    return {
      ...tab,
      isTemporarySharedDraft: undefined,
      temporaryShareExpiresAt: undefined,
    };
  });
}

export function findFirstTemporarySharedDraftIndex(tabs: Tab[]): number {
  const tempIndex = tabs.findIndex(isTemporarySharedDraft);
  return tempIndex === -1 ? tabs.length : tempIndex;
}

export function pruneExpiredTemporarySharedDrafts(tabs: Tab[], now = Date.now()): {
  tabs: Tab[];
  removedCount: number;
} {
  const nextTabs = tabs.filter((tab) => !isTemporarySharedDraftExpired(tab, now));
  return {
    tabs: nextTabs,
    removedCount: tabs.length - nextTabs.length,
  };
}

function messageHasMeaningfulInput(message: Message): boolean {
  return Boolean(
    message.content.trim() ||
    message.username.trim() ||
    message.avatar_url.trim() ||
    message.tts ||
    message.flags !== 0 ||
    message.thread_name?.trim() ||
    (message.components?.length ?? 0) > 0 ||
    (message.componentBlocks?.length ?? 0) > 0 ||
    (message.linkButtons?.length ?? 0) > 0 ||
    message.embeds.length > 0 ||
    (message._attachments?.length ?? 0) > 0,
  );
}

function isPristineDraftTab(tab: Tab): boolean {
  return !tab.webhookUrl.trim() && tab.messages.length === 1 && !messageHasMeaningfulInput(tab.messages[0]);
}

function nextSharedDraftName(tabs: Tab[]): string {
  const baseName = 'Shared Draft';
  if (!tabs.some((tab) => tab.name === baseName)) {
    return baseName;
  }

  let counter = 2;
  let nextName = `${baseName} ${counter}`;
  while (tabs.some((tab) => tab.name === nextName)) {
    counter += 1;
    nextName = `${baseName} ${counter}`;
  }

  return nextName;
}

function buildSharedDraftTab(tabs: Tab[], messages: Message[]): Tab {
  return {
    id: uid(),
    name: nextSharedDraftName(tabs),
    webhookUrl: '',
    messages,
    isTemporarySharedDraft: true,
    temporaryShareExpiresAt: undefined,
  };
}

export function buildTabsForSharedDraft(tabs: Tab[], messages: Message[]): SharedDraftInsertResult {
  const sharedTab = buildSharedDraftTab(tabs, messages);

  if (tabs.length === 1 && isPristineDraftTab(tabs[0])) {
    return {
      tabs: [{ ...sharedTab, id: tabs[0].id }],
      activeTabIndex: 0,
      mode: 'replaced-empty',
    };
  }

  if (tabs.length >= 10) {
    const reusableBlankIndex = tabs.findIndex(isPristineDraftTab);
    if (reusableBlankIndex !== -1) {
      const nextTabs = [...tabs];
      nextTabs[reusableBlankIndex] = { ...sharedTab, id: tabs[reusableBlankIndex].id };
      return {
        tabs: nextTabs,
        activeTabIndex: reusableBlankIndex,
        mode: 'reused-empty',
      };
    }

    return {
      error: 'Draft limit reached. Delete a draft or clear an empty one before opening another share link.',
    };
  }

  return {
    tabs: [...tabs, sharedTab],
    activeTabIndex: tabs.length,
    mode: 'added',
  };
}
