import { describe, expect, it } from 'vitest';
import { discordMessageAttachments } from './discordAttachments';
import { parseDiscordPayloadToMessage } from './utils';
import { activeMessageAttachments, componentPreviewUrl } from './componentAttachments';
import { buildEditPatch, retainedAttachmentIdsForEdit } from './editPayload';
import { buildPayload, getSendBlockingReason } from './payload';

describe('uploads hidden inside Discord components', () => {
  it('loads gallery, thumbnail and file uploads that are absent from the visible attachment list', () => {
    const media = (id: string, filename: string) => ({ attachment_id: id, url: `https://cdn.discordapp.com/attachments/1/${id}/${filename}?ex=valid&hm=valid`, content_type: 'image/png' });
    const data = { id: '789', flags: 32768, content: '', embeds: [], attachments: [], components: [{ type: 17, components: [
      { type: 10, content: 'Before' },
      { type: 12, items: [{ media: media('111', 'cat%20one.png') }, { media: media('222', 'cat-two.png') }] },
      { type: 9, components: [{ type: 10, content: 'Beside an image' }], accessory: { type: 11, media: media('333', 'thumbnail.png') } },
      { type: 13, file: media('444', 'file.png') },
    ] }] };
    const loaded = parseDiscordPayloadToMessage(data);
    expect(loaded.loadedAttachmentIds).toEqual(['111', '222', '333', '444']);
    expect(activeMessageAttachments(loaded)).toHaveLength(4);
    expect(componentPreviewUrl('attachment://cat one.png', loaded._attachments ?? [])).toBe(media('111', 'cat%20one.png').url);
    expect(getSendBlockingReason([loaded], [4])).toBeNull();
    expect(retainedAttachmentIdsForEdit(loaded, '789', ['111', '222', '333', '444'])).toBeNull();
    const before = buildPayload(loaded);
    const container = loaded.componentBlocks![0];
    if (container.type !== 'container' || container.blocks[0].type !== 'text' || container.blocks[1].type !== 'gallery') throw new Error('Expected fixture');
    container.blocks[0].content = 'After';
    const patch = buildEditPatch(before, buildPayload(loaded));
    expect(patch.attachments).toBeUndefined();
    expect(patch).toHaveProperty('components.0.components.1.items.0.media.url', 'attachment://cat one.png');
    container.blocks[1].items.pop();
    expect(retainedAttachmentIdsForEdit(loaded, '789', ['111', '222', '333', '444'])).toEqual({ ids: ['111', '333', '444'], conflict: false });
  });

  it('deduplicates shared media and retains authoritative visible file metadata', () => {
    const file = { id: '111', filename: 'original.png', url: 'https://cdn.discordapp.com/attachments/1/111/original.png', size: 1000 };
    const media = { attachment_id: '111', url: file.url };
    expect(discordMessageAttachments({ attachments: [file], components: [{ type: 12, items: [{ media }, { media }] }] })).toEqual([file]);
    expect(discordMessageAttachments({ attachments: [], components: [{ type: 12, items: [{ media }, { media }] }] })).toHaveLength(1);
  });

  it('does not treat a linked Discord CDN image as an upload belonging to this message', () => {
    const url = 'https://cdn.discordapp.com/attachments/1/111/other-message.png';
    expect(discordMessageAttachments({ attachments: [], embeds: [{ type: 'rich', image: { url } }], components: [{ type: 12, items: [{ media: { url } }] }] })).toEqual([]);
  });
});
