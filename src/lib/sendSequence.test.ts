import { describe, expect, it } from 'vitest';
import { activeEmbedTextLength, reconcileSequenceReceipt } from './sendSequence';
import { createDefaultEmbed, createDefaultMessage } from './utils';
import type { Tab } from './types';
import { getSendBlockingReason } from './payload';

describe('send sequence regression fixes', () => {
  it('does not block valid V2 text because dormant regular embeds exceed 6000 characters', () => {
    const msg = createDefaultMessage();
    msg.embeds = [createDefaultEmbed(), createDefaultEmbed()];
    msg.embeds[0].description = 'a'.repeat(4000); msg.embeds[1].description = 'b'.repeat(3000);
    expect(activeEmbedTextLength(msg)).toBe(7000);
    expect(getSendBlockingReason([msg], [0])).toContain('6,000');
    msg.componentMode = 'v2';
    msg.componentBlocks = [{ id: 'text', type: 'text', content: 'Valid V2 message' }];
    expect(activeEmbedTextLength(msg)).toBe(0);
    expect(getSendBlockingReason([msg], [0])).toBeNull();
    msg.componentMode = 'standard'; msg.flags = 32768;
    expect(activeEmbedTextLength(msg)).toBe(0);
  });
  it('saves the receipt into the original draft after switching drafts and reordering messages', () => {
    const sent = { ...createDefaultMessage(), id: 'sent', content: 'Before' };
    const changed = { ...sent, content: 'Edited while sending' };
    const other = { ...createDefaultMessage(), id: 'other', content: 'Other draft' };
    const tabs: Tab[] = [{ id: 'other-draft', name: 'Current', messages: [other], webhookUrl: '' },
      { id: 'source-draft', name: 'Source', messages: [createDefaultMessage(), changed], webhookUrl: '' }];
    const reconciled = reconcileSequenceReceipt(tabs, 'source-draft', sent, { id: 'discord-123', content: 'Before', embeds: [], attachments: [] });
    expect(reconciled[0]).toBe(tabs[0]);
    expect(reconciled[1].messages[1]).toMatchObject({ id: 'sent', content: 'Edited while sending', loadedFromMessageId: 'discord-123' });
    expect(reconciled[1].messages[1].loadedPayload).toMatchObject({ content: 'Before' });
    expect(tabs[1].messages[1]).not.toHaveProperty('loadedFromMessageId');
  });
  it('never resurrects a removed draft or message when a late receipt arrives', () => {
    const sent = createDefaultMessage();
    const tabs: Tab[] = [{ id: 'new-draft', name: 'New', messages: [createDefaultMessage()], webhookUrl: '' }];
    const receipt = { id: 'discord-123', embeds: [], attachments: [] };
    expect(reconcileSequenceReceipt(tabs, 'removed-draft', sent, receipt)).toBe(tabs);
    expect(reconcileSequenceReceipt(tabs, 'new-draft', sent, receipt)).toBe(tabs);
  });
});
