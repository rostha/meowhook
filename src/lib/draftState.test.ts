import { describe, expect, it } from 'vitest';
import type { Tab } from './types';
import { cloneDraftHistorySnapshot, cloneTabsForHistory, stripTransientAttachmentsFromTabs } from './draftState';
import { createDefaultEmbed, createDefaultField, createDefaultMessage } from './utils';

function createDraftTab(): Tab {
  const field = createDefaultField();
  field.name = 'Name';
  field.value = 'Value';
  field.inline = true;

  const embed = createDefaultEmbed();
  embed.title = 'Embed title';
  embed.fields = [field];

  const message = createDefaultMessage();
  message.content = 'Hello';
  message.embeds = [embed];
  message._attachments = [
    {
      fieldKey: 'content_file_0',
      previewUrl: 'blob:file-0',
      file: {} as File,
    },
  ];

  return {
    id: 'tab-1',
    name: 'Draft 1',
    webhookUrl: 'https://discord.com/api/webhooks/example',
    messages: [message],
  };
}

describe('cloneTabsForHistory', () => {
  it('deep clones tab content while preserving file references', () => {
    const original = [createDraftTab()];
    const cloned = cloneTabsForHistory(original);

    expect(cloned).not.toBe(original);
    expect(cloned[0]).not.toBe(original[0]);
    expect(cloned[0].messages[0]).not.toBe(original[0].messages[0]);
    expect(cloned[0].messages[0].embeds[0]).not.toBe(original[0].messages[0].embeds[0]);
    expect(cloned[0].messages[0].embeds[0].fields[0]).not.toBe(original[0].messages[0].embeds[0].fields[0]);
    expect(cloned[0].messages[0]._attachments?.[0]).not.toBe(original[0].messages[0]._attachments?.[0]);
    expect(cloned[0].messages[0]._attachments?.[0].file).toBe(original[0].messages[0]._attachments?.[0].file);

    cloned[0].messages[0].content = 'Updated';
    cloned[0].messages[0].embeds[0].fields[0].name = 'Updated field';

    expect(original[0].messages[0].content).toBe('Hello');
    expect(original[0].messages[0].embeds[0].fields[0].name).toBe('Name');
  });
});

describe('cloneDraftHistorySnapshot', () => {
  it('returns an isolated snapshot copy', () => {
    const snapshot = {
      activeTabIndex: 0,
      tabs: [createDraftTab()],
    };

    const cloned = cloneDraftHistorySnapshot(snapshot);
    cloned.tabs[0].messages[0].content = 'Changed';

    expect(snapshot.tabs[0].messages[0].content).toBe('Hello');
  });
});

describe('stripTransientAttachmentsFromTabs', () => {
  it('preserves file references without serializing browser blob URLs or File objects', () => {
    const stripped = stripTransientAttachmentsFromTabs([createDraftTab()]);

    const attachment = stripped[0].messages[0]._attachments![0];
    expect(attachment.file).toBeUndefined();
    expect(attachment.fileId).toBeTruthy();
    expect(attachment.previewUrl).toBe('local-file:' + attachment.fileId);
    expect(stripped[0].messages[0].content).toBe('Hello');
    expect(stripped[0].messages[0].embeds[0].title).toBe('Embed title');
  });
});
