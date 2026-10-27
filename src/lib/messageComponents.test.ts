import { describe, expect, it } from 'vitest';
import { buildPayload, getSendBlockingReason } from './payload';
import { createDefaultEmbed, createDefaultMessage } from './utils';
import { hasComponentPreviewContent, newBlock, regularMessageToV2Blocks, retainV2ModeWhenLoading } from './messageComponents';
import { parseImportedDraftData, parseDiscordPayloadToMessage } from './utils';

describe('ordinary webhook components', () => {
  it('keeps blank layout scaffolding out of the message preview without changing it', () => {
    const blocks = [newBlock('text'), newBlock('section'), newBlock('gallery'), newBlock('file'), newBlock('container'), newBlock('links')];
    const original = JSON.stringify(blocks);
    expect(hasComponentPreviewContent(blocks)).toBe(false);
    expect(hasComponentPreviewContent([{ id: 'space', type: 'text', content: '  \n ' }])).toBe(false);
    expect(JSON.stringify(blocks)).toBe(original);
  });

  it('recognizes real text and media inside containers and sections', () => {
    expect(hasComponentPreviewContent([{ id: 'container', type: 'container', color: 0, blocks: [{ id: 'text', type: 'text', content: '# Hello' }] }])).toBe(true);
    expect(hasComponentPreviewContent([{ id: 'section', type: 'section', content: '', url: '', description: '', texts: [{ id: 'extra', content: 'More text' }] }])).toBe(true);
    expect(hasComponentPreviewContent([{ id: 'image', type: 'gallery', items: [{ id: 'upload', url: 'attachment://photo.png', description: '' }] }])).toBe(true);
    expect(hasComponentPreviewContent([{ id: 'file', type: 'file', url: 'blob:upload' }])).toBe(true);
    expect(hasComponentPreviewContent([newBlock('separator')])).toBe(true);
  });

  it('sends link buttons with regular text, and validates links', () => {
    const message = createDefaultMessage();
    message.content = 'Visit us';
    message.linkButtons = [{ id: 'link', label: 'Website', url: 'https://example.com' }];
    expect(getSendBlockingReason([message], [0])).toBeNull();
    expect(buildPayload(message).components).toEqual([{ type: 1, components: [{ type: 2, style: 5, label: 'Website', url: 'https://example.com' }] }]);
    message.linkButtons[0].url = 'javascript:alert(1)';
    expect(getSendBlockingReason([message], [0])).toMatch(/valid HTTP or HTTPS URL/);
  });

  it('sends a container with text, image gallery and links while omitting retained embeds', () => {
    const message = createDefaultMessage();
    message.content = 'Regular draft content';
    message.embeds = [{ id: 'retained' } as never];
    message.componentMode = 'v2';
    message.componentBlocks = [{ id: 'container', type: 'container', color: 0x667788, blocks: [
      { id: 'text', type: 'text', content: '# Hello' },
      { id: 'gallery', type: 'gallery', items: [{ id: 'image', url: 'https://example.com/a.png', description: 'A sample' }] },
      { id: 'links', type: 'links', buttons: [{ id: 'button', label: 'See more', url: 'https://example.com' }] },
    ] }];
    expect(getSendBlockingReason([message], [0])).toBeNull();
    const payload = buildPayload(message);
    expect(payload.flags! & 32768).toBe(32768);
    expect(payload).not.toHaveProperty('content');
    expect(payload).not.toHaveProperty('embeds');
    expect(payload.components?.[0]).toMatchObject({ type: 17, accent_color: 0x667788, components: [
      { type: 10, content: '# Hello' }, { type: 12, items: [{ media: { url: 'https://example.com/a.png' }, description: 'A sample' }] },
      { type: 1, components: [{ style: 5, url: 'https://example.com' }] },
    ] });
  });

  it('blocks incomplete visual components and ignores dormant regular uploads', () => {
    const message = createDefaultMessage();
    message.componentMode = 'v2';
    message.componentBlocks = [newBlock('section')];
    expect(getSendBlockingReason([message], [0])).toMatch(/add up to 4,000 characters/);
    message.componentBlocks = [{ id: 'text', type: 'text', content: 'Hello' }];
    expect(getSendBlockingReason([message], [1])).toBeNull();
  });

  it('round trips visual blocks through draft import and a Discord message response', () => {
    const message = createDefaultMessage();
    message.componentMode = 'v2';
    message.componentBlocks = [{ id: 'first', type: 'text', content: '# Welcome' }];
    const [draft] = parseImportedDraftData({ messages: [message], name: 'Welcome', webhookUrl: '' });
    expect(draft.messages[0].componentBlocks).toEqual(message.componentBlocks);
    const fromDiscord = parseDiscordPayloadToMessage({ flags: 32768, components: buildPayload(message).components });
    expect(fromDiscord.componentMode).toBe('v2');
    expect(fromDiscord.componentBlocks?.[0]).toMatchObject({ type: 'text', content: '# Welcome' });
    const [fromRawPayload] = parseImportedDraftData(buildPayload(message));
    expect(fromRawPayload.messages[0].componentBlocks?.[0]).toMatchObject({ type: 'text', content: '# Welcome' });
  });

  it('retains dormant link settings when a thumbnail section is reloaded', () => {
    const message = createDefaultMessage();
    message.componentMode = 'v2';
    const button = { id: 'saved-button', label: 'Visit', url: 'https://example.com', emoji: '🐈', disabled: true };
    message.componentBlocks = [{ id: 'section', type: 'section', content: 'Text', accessory: 'thumbnail', url: 'https://example.com/thumb.png', description: 'Thumbnail', spoiler: true,
      button }];
    const reloaded = parseImportedDraftData(JSON.parse(JSON.stringify(message)))[0].messages[0];
    const section = reloaded.componentBlocks?.[0];
    expect(section).toMatchObject({ button, url: 'https://example.com/thumb.png', description: 'Thumbnail', spoiler: true });
    expect(buildPayload(reloaded).components?.[0]).toMatchObject({ accessory: { type: 11 } });
    if (section?.type !== 'section') throw Error('Missing section');
    expect(buildPayload({ ...reloaded, componentBlocks: [{ ...section, accessory: 'link' }] }).components?.[0]).toMatchObject({ accessory: { type: 2, label: 'Visit', emoji: { name: '🐈' }, disabled: true } });
  });

  it('rejects bot interaction controls in imported JSON', () => {
    expect(() => parseImportedDraftData({ flags: 32768, components: [{ type: 1, components: [{ type: 2, style: 1, custom_id: 'click' }] }] })).toThrow(/interactive or unsupported/);
  });

  it('turns regular message text, embed and links into editable V2 blocks', () => {
    const message = createDefaultMessage();
    message.content = 'Welcome';
    const embed = createDefaultEmbed();
    embed.title = 'Updates';
    embed.description = 'Latest news';
    embed.thumbnail.url = 'https://example.com/thumb.png';
    embed.fields = [{ id: 'field', name: 'When', value: 'Today', inline: false }];
    message.embeds = [embed];
    message.linkButtons = [{ id: 'link', label: 'Read more', url: 'https://example.com' }];
    const blocks = regularMessageToV2Blocks(message);
    expect(blocks.map(block => block.type)).toEqual(['text', 'container', 'links']);
    expect(blocks[1]).toMatchObject({ type: 'container', blocks: [{ type: 'section', url: 'https://example.com/thumb.png', content: expect.stringContaining('**When**\nToday') }] });
    message.componentMode = 'v2';
    message.componentBlocks = blocks;
    expect(getSendBlockingReason([message], [0])).toBeNull();
  });

  it('keeps a selected V2 mode when a regular sent message is loaded', () => {
    const loaded = parseDiscordPayloadToMessage({ id: '789', content: 'Original', embeds: [{ type: 'rich', description: 'Details' }] });
    loaded.loadedPayload = buildPayload(loaded);
    const current = createDefaultMessage();
    current.componentMode = 'v2';
    const ready = retainV2ModeWhenLoading(loaded, current);
    expect(ready.componentMode).toBe('v2');
    expect(ready.componentBlocks?.map(block => block.type)).toEqual(['text', 'container']);
    expect(ready.loadedPayload?.flags ?? 0).toBe(0);
    expect(ready.loadedPayload?.content).toBe('Original');
  });
});
