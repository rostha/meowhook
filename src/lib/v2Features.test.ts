import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentBlock, FileAttachment, Message } from './types';
import { buildPayload, getSendBlockingReason } from './payload';
import { blocksFromDiscord, buildComponentBlocks, componentBudget, hasUnsupportedDiscordComponents, normalizeComponentBlocks, regularMessageToV2Blocks, validateLinkButtons } from './messageComponents';
import { activeMessageAttachments, componentPreviewUrl } from './componentAttachments';
import { createDefaultEmbed, createDefaultMessage, messagesForSharePayload, parseDiscordPayloadToMessage, parseImportedDraftData } from './utils';
import { stripTransientAttachmentsFromTabs } from './draftState';
import { buildEditPatch, retainedAttachmentIdsForEdit } from './editPayload';
import { reconcileSentMessage } from './sentMessage';
import { pruneUnusedMessageAttachments } from './embedTransfers';
import { editMessage, sendMessage } from './webhook';
import { resetRateLimit } from './rateLimit';

const webhook = 'https://discord.com/api/webhooks/123/token';
const v2 = (blocks: ComponentBlock[], attachments?: FileAttachment[]): Message => ({ ...createDefaultMessage(), componentMode: 'v2', flags: 32768, componentBlocks: blocks, _attachments: attachments });
const section: ComponentBlock = { id: 'section', type: 'section', content: '**Title**', texts: [{ id: 'second', content: 'Details' }, { id: 'third', content: 'One more thing' }], accessory: 'link', button: { id: 'button', label: '', url: 'https://example.com', emoji: '🐈', disabled: true }, url: '', description: '' };
afterEach(() => { vi.unstubAllGlobals(); resetRateLimit(); });

describe('complete webhook V2 layouts', () => {
  it('round trips a three-text section with an emoji-only disabled link accessory', () => {
    const message = v2([section]);
    expect(getSendBlockingReason([message], [0])).toBeNull();
    const payload = buildPayload(message);
    expect(payload.components).toEqual([{ type: 9, components: [{ type: 10, content: '**Title**' }, { type: 10, content: 'Details' }, { type: 10, content: 'One more thing' }], accessory: { type: 2, style: 5, url: 'https://example.com', emoji: { name: '🐈' }, disabled: true } }]);
    expect(buildComponentBlocks(blocksFromDiscord(payload.components))).toEqual(payload.components);
    expect(buildPayload(parseImportedDraftData(message)[0].messages[0])).toEqual(payload);
  });

  it('retains spoilers on thumbnails, galleries, containers, and file cards without adding a missing accent', () => {
    const payload = [{ type: 17, spoiler: true, components: [
      { type: 9, components: [{ type: 10, content: 'Photo' }], accessory: { type: 11, media: { url: 'https://example.com/thumb.png' }, description: 'Cat', spoiler: true } },
      { type: 12, items: [{ media: { url: 'https://example.com/cat.png' }, spoiler: true }] },
      { type: 13, file: { url: 'attachment://guide.pdf' }, spoiler: true },
    ] }];
    const blocks = blocksFromDiscord(payload);
    expect(buildComponentBlocks(blocks)).toEqual(payload);
    expect(buildComponentBlocks(normalizeComponentBlocks(blocks))).toEqual(payload);
    expect(hasUnsupportedDiscordComponents(payload)).toBe(false);
  });

  it('supports animated custom emojis and rejects invalid emojis and unsafe button URLs', () => {
    const message = v2([{ id: 'row', type: 'links', buttons: [{ id: 'b', label: 'Read', url: 'https://example.com', emoji: '<a:cat:123456789012345678>' }] }]);
    expect(buildPayload(message).components?.[0]).toMatchObject({ components: [{ emoji: { name: 'cat', id: '123456789012345678', animated: true } }] });
    expect(validateLinkButtons([{ id: 'b', label: 'Read', url: 'https://example.com', emoji: 'not an emoji' }], 'Links')).toContain('needs one emoji');
    expect(validateLinkButtons([{ id: 'b', label: 'Read', url: 'javascript:alert(1)' }], 'Links')).toContain('valid HTTP');
  });

  it('counts gallery items as media rather than components and enforces the shared text budget', () => {
    const galleries: ComponentBlock[] = Array.from({ length: 40 }, (_, i) => ({ id: String(i), type: 'gallery', items: [{ id: 'image', url: 'https://example.com/a.png', description: '' }] }));
    expect(componentBudget(galleries).count).toBe(40);
    expect(getSendBlockingReason([v2(galleries)], [0])).toBeNull();
    expect(getSendBlockingReason([v2([...galleries, { id: 'more', type: 'separator', divider: true, spacing: 1 }])], [0])).toContain('at most 40');
    expect(getSendBlockingReason([v2([{ id: 'a', type: 'text', content: 'a'.repeat(2500) }, { id: 'b', type: 'text', content: 'b'.repeat(1501) }])], [0])).toContain('all V2 text together');
  });

  it('rejects unsupported action buttons, select menus, modal fields, and nested containers', () => {
    for (const component of [{ type: 1, components: [{ type: 2, style: 1, custom_id: 'click' }] }, { type: 3 }, { type: 19 }, { type: 17, components: [{ type: 17, components: [] }] }]) expect(hasUnsupportedDiscordComponents([component])).toBe(true);
  });
});

describe('V2 uploads and existing-message edits', () => {
  const file = new File(['document'], 'guide.pdf', { type: 'application/pdf' });
  const thumbnail = new File(['image'], 'thumb.png', { type: 'image/png' });
  const attachments = [{ file, previewUrl: 'blob:guide', fieldKey: 'component_file_guide', name: file.name }, { file: thumbnail, previewUrl: 'blob:thumb', fieldKey: 'component_file_thumb', name: thumbnail.name }];
  const blocks: ComponentBlock[] = [{ id: 'container', type: 'container', color: 0xa9b9b4, blocks: [{ id: 'file', type: 'file', url: 'blob:guide' }, { id: 'section', type: 'section', content: 'Before', url: 'blob:thumb', description: 'Thumbnail' }] }];

  it('keeps component uploads through pruning and excludes dormant regular-editor uploads', () => {
    const message = v2(blocks, [...attachments, { file, previewUrl: 'blob:dormant', fieldKey: 'content_file_0' }]);
    const ready = pruneUnusedMessageAttachments(message);
    expect(activeMessageAttachments(ready)).toEqual(attachments);
    expect(getSendBlockingReason([ready], [2])).toBeNull();
    expect(getSendBlockingReason([v2([{ id: 'file', type: 'file', url: 'https://example.com/guide.pdf' }])], [0])).toContain('cannot use a website URL');
    expect(activeMessageAttachments(v2(blocks, [...attachments, attachments[0]]))).toEqual(attachments);
  });

  it('converts regular attachments into file cards and preserves an embed without an accent', () => {
    const message = { ...createDefaultMessage(), embeds: [{ ...createDefaultEmbed(), description: 'Details', colorExplicit: false }], _attachments: [{ ...attachments[0], fieldKey: 'content_file_0' }] };
    const converted = v2(regularMessageToV2Blocks(message), message._attachments);
    expect(getSendBlockingReason([converted], [1])).toBeNull();
    expect(buildPayload(converted).components).toEqual([{ type: 17, components: [{ type: 10, content: 'Details' }] }, { type: 13, file: { url: 'blob:guide' } }]);
  });

  it('does not leak local file references into a shared layout', () => {
    const message = v2(blocks, attachments);
    const shared = messagesForSharePayload([message])[0];
    expect(shared).not.toHaveProperty('_attachments');
    expect(JSON.stringify(shared)).not.toMatch(/blob:|local-file:|attachment:\/\//);
    expect(shared.componentBlocks?.[0]).toMatchObject({ blocks: [{ type: 'file', url: '' }, { type: 'section', url: '' }] });
  });

  it('builds one multipart send with nested attachment references and no regular message fields', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"789"}')); vi.stubGlobal('fetch', fetch);
    const message = v2(blocks, attachments);
    expect((await sendMessage(webhook, buildPayload(message), activeMessageAttachments(message))).success).toBe(true);
    const body = fetch.mock.calls[0][1].body as FormData;
    const payload = JSON.parse(String(body.get('payload_json')));
    expect(payload.components[0].components[0].file.url).toBe('attachment://upload_0.pdf');
    expect(payload.components[0].components[1].accessory.media.url).toBe('attachment://upload_1.png');
    expect(payload).not.toHaveProperty('content'); expect(payload).not.toHaveProperty('embeds');
    expect(body.get('files[0]')).toBeInstanceOf(File); expect(body.get('files[1]')).toBeInstanceOf(File);
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('with_components')).toBe('true');
  });

  it('serializes local file identity and reports a missing file after an import on another device', () => {
    const stored = stripTransientAttachmentsFromTabs([{ id: 't', name: 'Files', webhookUrl: '', messages: [v2(blocks, attachments)] }]);
    const imported = parseImportedDraftData(JSON.parse(JSON.stringify(stored)))[0].messages[0];
    expect(imported.componentBlocks?.[0]).toMatchObject({ blocks: [{ type: 'file', url: expect.stringMatching(/^local-file:/) }, { type: 'section', url: expect.stringMatching(/^local-file:/) }] });
    expect(getSendBlockingReason([imported], [2])).toContain('re-uploading');
  });

  const response = { id: '789', flags: 32768, content: '', embeds: [], attachments: [
    { id: '111', filename: 'upload_0.pdf', url: 'https://cdn.discordapp.com/attachments/1/111/upload_0.pdf', content_type: 'application/pdf' },
    { id: '222', filename: 'upload_1.png', url: 'https://cdn.discordapp.com/attachments/1/222/upload_1.png', content_type: 'image/png' },
  ], components: [{ type: 17, accent_color: 0xa9b9b4, components: [{ type: 13, file: { url: 'https://cdn.discordapp.com/attachments/1/111/upload_0.pdf', attachment_id: '111' } }, { type: 9, components: [{ type: 10, content: 'Before' }], accessory: { type: 11, media: { url: 'https://cdn.discordapp.com/attachments/1/222/upload_1.png', attachment_id: '222' }, description: 'Thumbnail' } }] }] };

  it('loads a file and thumbnail as retained attachments and edits only their text without re-uploading', async () => {
    const message = parseDiscordPayloadToMessage(response);
    const baseline = buildPayload(message);
    const container = message.componentBlocks![0]; if (container.type !== 'container' || container.blocks[1].type !== 'section') throw Error('Missing section');
    container.blocks[1].content = 'After';
    expect(getSendBlockingReason([message], [2])).toBeNull();
    const patch = buildEditPatch(baseline, buildPayload(message));
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"789"}')); vi.stubGlobal('fetch', fetch);
    await editMessage(webhook, '789', patch, activeMessageAttachments(message).filter(attachment => !attachment.discordId));
    const sent = JSON.parse(fetch.mock.calls[0][1].body);
    expect(sent.components[0].components[0].file.url).toBe('attachment://upload_0.pdf');
    expect(sent.components[0].components[1].accessory.media.url).toBe('attachment://upload_1.png');
    expect(sent).not.toHaveProperty('attachments'); expect(sent).not.toHaveProperty('embeds');
    expect(componentPreviewUrl('attachment://upload_0.pdf', message._attachments!)).toBe(response.attachments[0].url);
  });

  it('reconciles a newly sent layout so later edits do not upload those files twice', () => {
    const sent = v2(blocks, attachments), updated = reconcileSentMessage(sent, sent, response);
    expect(activeMessageAttachments(updated).map(attachment => attachment.discordId)).toEqual(['111', '222']);
    expect(buildPayload(updated)).toEqual(updated.loadedPayload);
    expect(retainedAttachmentIdsForEdit(updated, '789', ['111', '222'])).toBeNull();
    const container = updated.componentBlocks![0]; if (container.type !== 'container') throw Error();
    container.blocks = container.blocks.filter(block => block.type !== 'file');
    expect(retainedAttachmentIdsForEdit(updated, '789', ['111', '222'])).toEqual({ ids: ['222'], conflict: false });
  });

  it('patches new media while retaining existing files in a multipart edit', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"789"}')); vi.stubGlobal('fetch', fetch);
    await editMessage(webhook, '789', { components: buildPayload(v2(blocks)).components, attachments: [{ id: 'existing' }] }, attachments);
    const body = fetch.mock.calls[0][1].body as FormData, payload = JSON.parse(String(body.get('payload_json')));
    expect(payload.attachments).toEqual([{ id: 'existing' }, { id: 0, filename: 'upload_0.pdf' }, { id: 1, filename: 'upload_1.png' }]);
    expect(payload.components[0].components[0].file.url).toBe('attachment://upload_0.pdf');
    expect(payload.components[0].components[1].accessory.media.url).toBe('attachment://upload_1.png');
  });

  it('never gives a new upload the same filename as a retained attachment', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"789"}')); vi.stubGlobal('fetch', fetch);
    await editMessage(webhook, '789', { components: [{ type: 12, items: [{ media: { url: 'attachment://upload_0.png' } }, { media: { url: 'blob:thumb' } }] }], attachments: [{ id: '222', filename: 'upload_0.png' }] }, [attachments[1]]);
    const body = fetch.mock.calls[0][1].body as FormData, payload = JSON.parse(String(body.get('payload_json')));
    expect(payload.components[0].items.map((item: { media: { url: string } }) => item.media.url)).toEqual(['attachment://upload_0.png', 'attachment://upload_1.png']);
    expect(payload.attachments).toEqual([{ id: '222', filename: 'upload_0.png' }, { id: 0, filename: 'upload_1.png' }]);
    expect((body.get('files[0]') as File).name).toBe('upload_1.png');
  });
});
