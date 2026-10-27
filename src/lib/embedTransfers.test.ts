import { describe, expect, it } from 'vitest';
import {
  buildEmbedAttachmentFieldKey,
  moveEmbedBetweenMessages,
  pruneUnusedMessageAttachments,
} from './embedTransfers';
import { createDefaultEmbed, createDefaultMessage } from './utils';
import type { ComponentBlock } from './types';
import { activeMessageAttachments } from './componentAttachments';

describe('pruneUnusedMessageAttachments', () => {
  it('keeps the metadata of a hosted avatar while pruning unrelated files', () => {
    const avatar = { fieldKey: 'avatar', previewUrl: 'https://example.com/avatar.png', name: 'avatar.png', size: 1024, mimeType: 'image/png' };
    const message = { ...createDefaultMessage(), avatar_url: avatar.previewUrl, _attachments: [avatar, { fieldKey: 'avatar', previewUrl: 'https://example.com/old.png', name: 'old.png' }] };
    expect(pruneUnusedMessageAttachments(message)._attachments).toEqual([avatar]);
  });

  it('preserves a dormant uploaded thumbnail when a section uses a link button', () => {
    const thumbnail = { fieldKey: 'component_file_thumb', previewUrl: 'blob:thumb', file: new File(['image'], 'thumb.png', { type: 'image/png' }) };
    const componentBlocks: ComponentBlock[] = [{ id: 'section', type: 'section', content: 'Text', accessory: 'link', url: thumbnail.previewUrl, description: 'Saved alt', button: { id: 'button', label: 'Visit', url: 'https://example.com' } }];
    const message = { ...createDefaultMessage(), componentMode: 'v2' as const, flags: 32768, componentBlocks, _attachments: [thumbnail] };
    const pruned = pruneUnusedMessageAttachments(message);
    expect(pruned._attachments).toEqual([thumbnail]);
    expect(activeMessageAttachments(pruned)).toEqual([]);
    expect(activeMessageAttachments({ ...pruned, componentMode: 'standard', flags: 0 })).toEqual([]);
    const section = componentBlocks[0];
    if (section.type !== 'section') throw Error('Missing section');
    expect(activeMessageAttachments({ ...pruned, componentBlocks: [{ ...section, accessory: 'thumbnail' }] })).toEqual([thumbnail]);
    const embed = createDefaultEmbed();
    embed.image.url = thumbnail.previewUrl;
    expect(activeMessageAttachments({ ...pruned, componentMode: 'standard', flags: 0, embeds: [embed] })).toEqual([thumbnail]);
  });

  it('removes stale embed attachments that are no longer referenced', () => {
    const embed = createDefaultEmbed();
    embed.id = 'embed-one';
    embed.image.url = 'blob:image-a';

    const message = {
      ...createDefaultMessage(),
      embeds: [embed],
      _attachments: [
        { fieldKey: buildEmbedAttachmentFieldKey(embed.id, 'image'), previewUrl: 'blob:image-a', file: {} as File },
        { fieldKey: 'embed.0.thumbnail', previewUrl: 'blob:stale-thumb', file: {} as File },
        { fieldKey: 'content_file_0', previewUrl: 'blob:file-a', file: {} as File },
      ],
    };

    const pruned = pruneUnusedMessageAttachments(message);

    expect(pruned._attachments).toHaveLength(2);
    expect(pruned._attachments?.map((attachment) => attachment.previewUrl)).toEqual(['blob:image-a', 'blob:file-a']);
  });
});

describe('moveEmbedBetweenMessages', () => {
  it('moves an embed and its referenced blob attachment to the target message', () => {
    const embed = createDefaultEmbed();
    embed.id = 'embed-move';
    embed.image.url = 'blob:moved-image';

    const source = {
      ...createDefaultMessage(),
      id: 'message-1',
      embeds: [embed],
      _attachments: [
        { fieldKey: 'embed.0.image', previewUrl: 'blob:moved-image', file: {} as File },
      ],
    };

    const target = {
      ...createDefaultMessage(),
      id: 'message-2',
      embeds: [],
    };

    const result = moveEmbedBetweenMessages([source, target], 0, 1, embed.id);

    expect(result.error).toBeUndefined();
    expect(result.messages[0].embeds).toHaveLength(0);
    expect(result.messages[0]._attachments).toBeUndefined();
    expect(result.messages[1].embeds).toHaveLength(1);
    expect(result.messages[1].embeds[0].id).toBe(embed.id);
    expect(result.messages[1]._attachments?.map((attachment) => attachment.previewUrl)).toEqual(['blob:moved-image']);
  });

  it('blocks moves that would push the target message past the upload limit', () => {
    const movingEmbed = createDefaultEmbed();
    movingEmbed.id = 'moving-embed';
    movingEmbed.image.url = 'blob:new-image';

    const source = {
      ...createDefaultMessage(),
      embeds: [movingEmbed],
      _attachments: [{ fieldKey: 'embed.0.image', previewUrl: 'blob:new-image', file: {} as File }],
    };

    const targetEmbeds = Array.from({ length: 9 }, (_, index) => {
      const embed = createDefaultEmbed();
      embed.id = `target-${index}`;
      embed.image.url = `blob:existing-${index}`;
      if (index === 8) {
        embed.thumbnail.url = 'blob:existing-thumb-8';
      }
      return embed;
    });

    const target = {
      ...createDefaultMessage(),
      embeds: targetEmbeds,
      _attachments: [
        ...targetEmbeds.map((embed, index) => ({
          fieldKey: buildEmbedAttachmentFieldKey(embed.id, 'image'),
          previewUrl: `blob:existing-${index}`,
          file: {} as File,
        })),
        {
          fieldKey: buildEmbedAttachmentFieldKey(targetEmbeds[8].id, 'thumbnail'),
          previewUrl: 'blob:existing-thumb-8',
          file: {} as File,
        },
      ],
    };

    const result = moveEmbedBetweenMessages([source, target], 0, 1, movingEmbed.id);

    expect(result.error).toContain('uploaded attachments');
    expect(result.messages[0].embeds).toHaveLength(1);
    expect(result.messages[1].embeds).toHaveLength(9);
  });
});
