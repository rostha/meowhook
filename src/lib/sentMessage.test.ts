import { describe, expect, it } from 'vitest';
import { buildPayload } from './payload';
import { buildEditPatch, editBaseline } from './editPayload';
import { reconcileSentMessage } from './sentMessage';
import { pruneUnusedMessageAttachments } from './embedTransfers';
import { createDefaultEmbed, createDefaultMessage } from './utils';

describe('sent upload reconciliation', () => {
  it('matches a freshly sent gallery upload even when Discord omits it from attachments', () => {
    const sent = createDefaultMessage();
    sent.componentMode = 'v2'; sent.flags = 32768; sent.embeds = [];
    sent.componentBlocks = [{ id: 'gallery', type: 'gallery', items: [{ id: 'image', url: 'blob:cat', description: '' }] }];
    sent._attachments = [{ fieldKey: 'component_file_cat', previewUrl: 'blob:cat', file: new File(['cat'], 'cat.png'), name: 'cat.png' }];
    const response = { id: '789', flags: 32768, embeds: [], attachments: [], components: [{ type: 12, items: [{ media: { attachment_id: '111', url: 'https://cdn.discordapp.com/attachments/1/111/upload_0.png?ex=valid&hm=valid' } }] }] };
    const reconciled = reconcileSentMessage(sent, sent, response);
    expect(reconciled._attachments?.[0].discordId).toBe('111');
    expect(reconciled.componentBlocks?.[0]).toHaveProperty('items.0.url', 'attachment://upload_0.png');
    expect(buildEditPatch(reconciled.loadedPayload!, buildPayload(reconciled))).toEqual({});
  });
  it('keeps sent thumbnails and files from being uploaded again on description edit', () => {
    const sent = createDefaultMessage();
    sent.content = 'Keep this text';
    const embed = createDefaultEmbed();
    embed.description = 'Before';
    embed.thumbnail.url = 'blob:thumbnail';
    sent.embeds = [embed];
    sent._attachments = [
      { fieldKey: 'embed_thumbnail', previewUrl: 'blob:thumbnail', file: new File(['thumb'], 'thumb.png') },
      { fieldKey: 'content_file_0', previewUrl: 'blob:document', file: new File(['file'], 'file.txt') },
    ];
    const response = {
      id: '789', content: 'Keep this text', flags: 0,
      embeds: [{ type: 'rich', description: 'Before', color: embed.color, thumbnail: { url: 'https://cdn.discordapp.com/attachments/1/222/upload_0.png' } }],
      attachments: [{ id: '333', filename: 'upload_1.txt', url: 'https://cdn.discordapp.com/attachments/1/333/upload_1.txt' }],
    };
    const reconciled = reconcileSentMessage(sent, sent, response);
    expect(reconciled.embeds[0].thumbnail.url).toBe(response.embeds[0].thumbnail.url);
    expect(reconciled._attachments?.[1].discordId).toBe('333');
    expect(reconciled._attachments?.[1].file).toBe(sent._attachments[1].file);
    expect(reconciled.sentBlobUrls).toEqual(['blob:thumbnail', 'blob:document']);

    reconciled.embeds[0].description = 'After';
    const readyToEdit = pruneUnusedMessageAttachments(reconciled);
    const patch = buildEditPatch(editBaseline(readyToEdit, '789', {}), buildPayload(readyToEdit));
    expect(patch).toEqual({ embeds: [{ description: 'After', color: embed.color, thumbnail: { url: response.embeds[0].thumbnail.url } }] });
    expect(readyToEdit._attachments?.filter((file) => !file.discordId && file.fieldKey !== 'avatar')).toEqual([]);
  });

  it('does not replace an image changed while the send request was pending', () => {
    const sent = createDefaultMessage();
    const embed = createDefaultEmbed();
    embed.thumbnail.url = 'blob:old';
    sent.embeds = [embed];
    const current = { ...sent, embeds: [{ ...embed, thumbnail: { url: 'blob:new' } }] };
    const result = reconcileSentMessage(current, sent, {
      id: '789', embeds: [{ type: 'rich', thumbnail: { url: 'https://cdn.discordapp.com/attachments/1/222/old.png' } }], attachments: [],
    });
    expect(result.embeds[0].thumbnail.url).toBe('blob:new');
  });
});
