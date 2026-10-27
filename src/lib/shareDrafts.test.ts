import { describe, expect, it } from 'vitest';
import { buildTabsForSharedDraft, splitTemporarySharedDrafts } from './shareDrafts';
import { createDefaultEmbed, createDefaultMessage, uid } from './utils';
import type { Tab } from './types';

function createTab(name: string, overrides?: Partial<Tab>): Tab {
  return {
    id: uid(),
    name,
    webhookUrl: '',
    messages: [createDefaultMessage()],
    ...overrides,
  };
}

describe('buildTabsForSharedDraft', () => {
  it('replaces the default empty draft in a pristine workspace', () => {
    const incoming = createDefaultMessage();
    incoming.content = 'Shared content';

    const result = buildTabsForSharedDraft([createTab('Draft 1')], [incoming]);

    if ('error' in result) throw new Error(result.error);
    expect(result.mode).toBe('replaced-empty');
    expect(result.tabs).toHaveLength(1);
    expect(result.activeTabIndex).toBe(0);
    expect(result.tabs[0].name).toBe('Shared Draft');
    expect(result.tabs[0].isTemporarySharedDraft).toBe(true);
    expect(result.tabs[0].messages[0].content).toBe('Shared content');
  });

  it('adds the shared draft as a new tab when there is existing work', () => {
    const existing = createDefaultMessage();
    existing.content = 'Keep me';
    const incoming = createDefaultMessage();
    incoming.content = 'Shared content';

    const result = buildTabsForSharedDraft(
      [createTab('Draft 1', { messages: [existing], webhookUrl: 'https://discord.com/api/webhooks/example' })],
      [incoming],
    );

    if ('error' in result) throw new Error(result.error);
    expect(result.mode).toBe('added');
    expect(result.tabs).toHaveLength(2);
    expect(result.activeTabIndex).toBe(1);
    expect(result.tabs[0].messages[0].content).toBe('Keep me');
    expect(result.tabs[1].name).toBe('Shared Draft');
    expect(result.tabs[1].isTemporarySharedDraft).toBe(true);
  });

  it('reuses an empty placeholder draft when already at the draft limit', () => {
    const filledTabs = Array.from({ length: 9 }, (_, index) => {
      const message = createDefaultMessage();
      message.content = `Draft ${index + 1}`;
      return createTab(`Draft ${index + 1}`, { messages: [message] });
    });
    const incoming = createDefaultMessage();
    incoming.embeds = [createDefaultEmbed()];
    const tabs = [...filledTabs, createTab('Draft 10')];

    const result = buildTabsForSharedDraft(tabs, [incoming]);

    if ('error' in result) throw new Error(result.error);
    expect(result.mode).toBe('reused-empty');
    expect(result.tabs).toHaveLength(10);
    expect(result.tabs[result.activeTabIndex].name).toBe('Shared Draft');
    expect(result.tabs[result.activeTabIndex].messages[0].embeds).toHaveLength(1);
  });

  it('returns an error when the workspace is full with no blank draft to reuse', () => {
    const tabs = Array.from({ length: 10 }, (_, index) => {
      const message = createDefaultMessage();
      message.content = `Draft ${index + 1}`;
      return createTab(`Draft ${index + 1}`, { messages: [message] });
    });
    const incoming = createDefaultMessage();
    incoming.content = 'Shared content';

    const result = buildTabsForSharedDraft(tabs, [incoming]);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/Draft limit reached/i);
    }
  });

  it('splits persistent and temporary drafts into separate groups', () => {
    const tabs = [
      createTab('Draft 1'),
      createTab('Shared Draft', { isTemporarySharedDraft: true }),
      createTab('Draft 2'),
      createTab('Shared Draft 2', { isTemporarySharedDraft: true }),
    ];

    const result = splitTemporarySharedDrafts(tabs);

    expect(result.persistentTabs.map((tab) => tab.name)).toEqual(['Draft 1', 'Draft 2']);
    expect(result.temporaryTabs.map((tab) => tab.name)).toEqual(['Shared Draft', 'Shared Draft 2']);
  });
});
