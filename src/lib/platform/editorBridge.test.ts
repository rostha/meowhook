import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistEditorMedia, materializeEditorMedia } from './editorBridge';
import { uploadPlatformMedia } from './mediaClient';
import { createDefaultEmbed, createDefaultMessage } from '@/lib/utils';
vi.mock('./mediaClient', () => ({ uploadPlatformMedia: vi.fn() }));

const origin = 'http://localhost:3000';
const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const firstUrl = `${origin}/api/platform/media/${firstId}`;
const secondUrl = `${origin}/api/platform/media/${secondId}`;
beforeEach(() => {
  vi.stubGlobal('window', { location: { origin } });
  vi.mocked(uploadPlatformMedia).mockReset().mockResolvedValue({ url: firstUrl, name: 'cat.png', size: 3, type: 'image/png' });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('visual editor account media bridge', () => {
  it('uploads media without rewriting matching message text, field values or link destinations', async () => {
    const message = createDefaultMessage(); const embed = createDefaultEmbed();
    message.content = 'blob:cat'; embed.description = 'blob:cat'; embed.url = 'blob:cat'; embed.image.url = 'blob:cat';
    embed.fields = [{ id: 'field', name: 'blob:cat', value: 'blob:cat', inline: true }]; message.embeds = [embed];
    message.componentBlocks = [{ id: 'container', type: 'container', color: 0xa9b9b4, blocks: [{ id: 'section', type: 'section', content: 'blob:cat', accessory: 'link', button: { id: 'button', label: 'blob:cat', url: 'blob:cat' }, url: 'blob:cat', description: 'blob:cat' }] }];
    message._attachments = [{ previewUrl: 'blob:cat', fieldKey: 'embed_image', name: 'cat.png', file: new File(['cat'], 'cat.png', { type: 'image/png' }) }];
    const saved = await persistEditorMedia(message);
    expect(saved.content).toBe('blob:cat'); expect(saved.embeds[0]).toMatchObject({ description: 'blob:cat', url: 'blob:cat', image: { url: firstUrl }, fields: embed.fields });
    expect(saved.componentBlocks?.[0]).toMatchObject({ blocks: [{ content: 'blob:cat', description: 'blob:cat', url: firstUrl, button: { label: 'blob:cat', url: 'blob:cat' } }] });
    expect(saved._attachments?.[0]).toMatchObject({ previewUrl: firstUrl, platformMediaId: firstId });
    expect(saved._attachments?.[0]).not.toHaveProperty('file'); expect(message.embeds[0].image.url).toBe('blob:cat');
  });
  it('uploads one File only once when it has multiple preview references', async () => {
    const message = createDefaultMessage(); const file = new File(['cat'], 'cat.png');
    message._attachments = [{ previewUrl: 'blob:a', fieldKey: 'content_file_0', file }, { previewUrl: 'blob:b', fieldKey: 'content_file_1', file }];
    await persistEditorMedia(message); expect(uploadPlatformMedia).toHaveBeenCalledTimes(1);
  });
  it('restores file bytes and field arrays, then reuses durable uploads when saving again', async () => {
    const message = createDefaultMessage(); const embed = createDefaultEmbed(); embed.image.url = firstUrl;
    embed.fields = [{ id: 'first-field', name: 'Name', value: firstUrl, inline: false }, { id: 'second-field', name: 'Second', value: 'Value', inline: true }];
    message.embeds = [embed]; message.content = firstUrl;
    message._attachments = [{ previewUrl: firstUrl, name: 'cat.png', mimeType: 'image/png', fieldKey: 'embed_image', platformMediaId: firstId }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['cat'], { type: 'image/png' }))));
    const objectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:restored');
    const restored = await materializeEditorMedia(message);
    expect(restored._attachments?.[0].file).toBeInstanceOf(File); expect(restored.embeds[0].image.url).toBe('blob:restored');
    expect(restored.content).toBe(firstUrl); expect(restored.embeds[0].fields).toEqual(embed.fields);
    const saved = await persistEditorMedia(restored);
    expect(uploadPlatformMedia).not.toHaveBeenCalled(); expect(saved.embeds[0].image.url).toBe(firstUrl);
    expect(objectUrl).toHaveBeenCalledTimes(1);
  });
  it('cleans every created object URL if another parallel materialization fails', async () => {
    const message = createDefaultMessage(); message._attachments = [{ previewUrl: firstUrl, name: 'first.png', fieldKey: 'content_file_0' }, { previewUrl: secondUrl, name: 'second.png', fieldKey: 'content_file_1' }];
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => url.href === firstUrl ? new Response('cat') : new Response('not found', { status: 404 })));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:created-before-failure');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    await expect(materializeEditorMedia(message)).rejects.toThrow('unavailable');
    expect(revoke).toHaveBeenCalledWith('blob:created-before-failure');
  });
  it('refuses foreign media hosts before downloading them', async () => {
    const message = createDefaultMessage(); message._attachments = [{ previewUrl: `https://foreign.example/api/platform/media/${firstId}`, name: 'foreign.png', fieldKey: 'content_file_0' }];
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(materializeEditorMedia(message)).rejects.toThrow('uploaded again'); expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps remote avatar and embed/gallery URLs while dropping unnecessary file metadata', async () => {
    const message = createDefaultMessage(), embed = createDefaultEmbed();
    const avatar = 'https://images.example/avatar.png';
    const image = 'https://cdn.discordapp.com/attachments/123/456/image.png?ex=abcdef';
    message.avatar_url = avatar; embed.image.url = image; message.embeds = [embed];
    message.componentBlocks = [{ id: 'gallery', type: 'gallery', items: [{ id: 'image', url: image, description: 'An image' }] }];
    message._attachments = [{ previewUrl: avatar, name: 'avatar.png', fieldKey: 'avatar' }, { previewUrl: image, name: 'image.png', fieldKey: 'embed_image', discordId: '456' }];
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const saved = await persistEditorMedia(message);
    expect(saved.avatar_url).toBe(avatar); expect(saved.embeds[0].image.url).toBe(image);
    expect(saved.componentBlocks).toMatchObject([{ items: [{ url: image }] }]);
    expect(saved._attachments).toEqual([]); expect(fetcher).not.toHaveBeenCalled(); expect(uploadPlatformMedia).not.toHaveBeenCalled();
    expect(message._attachments).toHaveLength(2);
  });

  it('copies retained Discord content files in the browser without credentials or redirects', async () => {
    const message = createDefaultMessage();
    const remote = 'https://cdn.discordapp.com/attachments/123/456/original%20name.txt?ex=abcdef';
    message._attachments = [{ previewUrl: remote, fieldKey: 'content_file_0', discordId: '456' }];
    const fetcher = vi.fn(async () => new Response('notes', { headers: { 'Content-Type': 'text/plain' } })); vi.stubGlobal('fetch', fetcher);
    vi.mocked(uploadPlatformMedia).mockImplementation(async file => ({ url: firstUrl, name: file.name, size: file.size, type: file.type }));
    const saved = await persistEditorMedia(message);
    expect(fetcher).toHaveBeenCalledWith(new URL(remote), expect.objectContaining({ credentials: 'omit', redirect: 'error' }));
    const file = vi.mocked(uploadPlatformMedia).mock.calls[0][0];
    expect(file).toBeInstanceOf(File); expect(file.name).toBe('original name.txt'); expect(await file.text()).toBe('notes');
    expect(saved._attachments?.[0]).toMatchObject({ previewUrl: firstUrl, name: 'original name.txt', size: 5, mimeType: 'text/plain', platformMediaId: firstId });
    expect(saved._attachments?.[0]).not.toHaveProperty('discordId'); expect(saved._attachments?.[0]).not.toHaveProperty('file');
    expect(message._attachments?.[0].previewUrl).toBe(remote);
  });

  it('copies explicit V2 file bytes even when its attachment metadata has another field key', async () => {
    const message = createDefaultMessage();
    const remote = 'https://media.discordapp.net/attachments/123/456/report.pdf';
    message.componentMode = 'v2'; message.flags = 32768;
    message.componentBlocks = [{ id: 'container', type: 'container', color: 0xa9b9b4, blocks: [{ id: 'file', type: 'file', url: 'attachment://report.pdf' }] }];
    message._attachments = [{ previewUrl: remote, name: 'report.pdf', fieldKey: 'component_file_original', discordId: '456' }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response('PDF', { headers: { 'Content-Type': 'application/pdf' } })));
    const saved = await persistEditorMedia(message);
    expect(uploadPlatformMedia).toHaveBeenCalledTimes(1);
    expect(saved.componentBlocks).toMatchObject([{ blocks: [{ url: firstUrl }] }]);
    expect(saved._attachments?.[0].previewUrl).toBe(firstUrl);
  });

  it('rejects untrusted Discord file URLs before downloading or uploading', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    for (const previewUrl of ['https://foreign.example/attachments/1/2/file.txt', 'http://cdn.discordapp.com/attachments/1/2/file.txt', 'https://cdn.discordapp.com.evil.test/attachments/1/2/file.txt', 'https://cdn.discordapp.com:8443/attachments/1/2/file.txt', 'https://cdn.discordapp.com/other/file.txt']) {
      const message = createDefaultMessage(); message._attachments = [{ previewUrl, name: 'file.txt', fieldKey: 'content_file_0' }];
      await expect(persistEditorMedia(message), previewUrl).rejects.toThrow('uploaded again');
    }
    expect(fetcher).not.toHaveBeenCalled(); expect(uploadPlatformMedia).not.toHaveBeenCalled();
  });

  it('rejects oversized advertised or streamed files and cancels an oversized stream', async () => {
    const message = createDefaultMessage(); message._attachments = [{ previewUrl: 'https://cdn.discordapp.com/attachments/1/2/file.bin', name: 'file.bin', fieldKey: 'content_file_0' }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { headers: { 'Content-Length': String(20 * 1024 * 1024 + 1) } })));
    await expect(persistEditorMedia(message)).rejects.toThrow('20 MiB');
    const cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(20 * 1024 * 1024 + 1)); }, cancel: cancelled });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream)));
    await expect(persistEditorMedia(message)).rejects.toThrow('20 MiB');
    expect(cancelled).toHaveBeenCalledTimes(1); expect(uploadPlatformMedia).not.toHaveBeenCalled();
  });

  it('does not mutate the draft when a later retained file is unavailable', async () => {
    const message = createDefaultMessage();
    const first = 'https://cdn.discordapp.com/attachments/1/2/first.txt', second = 'https://cdn.discordapp.com/attachments/1/3/missing.txt';
    message._attachments = [{ previewUrl: first, name: 'first.txt', fieldKey: 'content_file_0' }, { previewUrl: second, name: 'missing.txt', fieldKey: 'content_file_1' }];
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => url.href === first ? new Response('first') : new Response('missing', { status: 404 })));
    await expect(persistEditorMedia(message)).rejects.toThrow('no longer available');
    expect(uploadPlatformMedia).toHaveBeenCalledTimes(1);
    expect(message._attachments.map(attachment => attachment.previewUrl)).toEqual([first, second]);
    expect(message._attachments.every(attachment => !attachment.file)).toBe(true);
  });
});
