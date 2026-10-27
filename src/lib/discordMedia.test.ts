import { describe, expect, it } from 'vitest';
import { normalizeDiscordMediaPayload } from './discordMedia';
import { buildEditPatch } from './editPayload';
import { buildPayload } from './payload';
import { parseDiscordPayloadToMessage } from './utils';

describe('Discord attachment media in edits', () => {
  it('resends an old embed image without its expired signature and keeps the preview URL', () => {
    const url = 'https://cdn.discordapp.com/attachments/123/456/image.png?ex=old&is=old&hm=expired';
    const message = parseDiscordPayloadToMessage({ id: '789', embeds: [{ type: 'rich', description: 'Before', image: { url }, thumbnail: { url } }], attachments: [] });
    const previous = buildPayload(message);
    message.embeds[0].description = 'After';
    expect(buildEditPatch(previous, buildPayload(message))).toEqual({ embeds: [{ description: 'After', image: { url: url.split('?')[0] }, thumbnail: { url: url.split('?')[0] } }] });
    expect(message.embeds[0].image.url).toBe(url);
    expect(message.embeds[0].thumbnail.url).toBe(url);
  });

  it('does not turn renewed signatures in older saved baselines into an image edit', () => {
    const base = 'https://cdn.discordapp.com/attachments/123/456/image.png';
    expect(buildEditPatch({ embeds: [{ image: { url: `${base}?ex=old&hm=old` } }] }, { embeds: [{ image: { url: `${base}?ex=new&hm=new` } }] })).toEqual({});
  });

  it('normalizes nested component media while preserving external signatures, links, and text', () => {
    const url = 'https://media.discordapp.net/attachments/123/456/image.png?ex=old&hm=old&width=300';
    const external = 'https://images.example.com/private.png?signature=required';
    const payload = { content: url, embeds: [{ url, author: { name: 'Author', url, icon_url: url }, footer: { text: 'Footer', icon_url: url }, image: { url: external } }], components: [
      { type: 17 as const, components: [
        { type: 12 as const, items: [{ media: { url } }, { media: { url: external } }, { media: { url: 'attachment://cat.png' } }] },
        { type: 9 as const, components: [{ type: 10 as const, content: url }], accessory: { type: 11 as const, media: { url } } },
        { type: 1 as const, components: [{ type: 2 as const, style: 5 as const, url, label: 'Link' }] },
      ] },
    ] };
    const normalized = normalizeDiscordMediaPayload(payload);
    expect(normalized).toEqual({ ...payload,
      embeds: [{ ...payload.embeds[0], author: { ...payload.embeds[0].author, icon_url: url.split('?')[0] }, footer: { text: 'Footer', icon_url: url.split('?')[0] } }],
      components: [{ type: 17, components: [
        { type: 12, items: [{ media: { url: url.split('?')[0] } }, { media: { url: external } }, { media: { url: 'attachment://cat.png' } }] },
        { type: 9, components: [{ type: 10, content: url }], accessory: { type: 11, media: { url: url.split('?')[0] } } },
        payload.components[0].components[2],
      ] }],
    });
    expect(payload.components[0].components[0]).toHaveProperty('items.0.media.url', url);
  });
});
