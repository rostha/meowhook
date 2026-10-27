import { afterEach, describe, expect, it, vi } from 'vitest';
import { editMessage, sendMessage, loadMessage, deleteMessage } from './webhook';
import { resetRateLimit } from './rateLimit';
import { parseDiscordPayloadToMessage } from './utils';
import { buildPayload } from './payload';
import { MAX_UPLOAD_BYTES } from './uploadLimits';

const webhook = 'https://discord.com/api/webhooks/123/token?thread_id=456';
afterEach(() => { vi.unstubAllGlobals(); resetRateLimit(); });

describe('webhook requests', () => {
  it('normalizes expired Discord image URLs at the request boundary', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"789"}')); vi.stubGlobal('fetch', fetch);
    await editMessage(webhook, '789', { embeds: [{ description: 'After', image: { url: 'https://cdn.discordapp.com/attachments/1/111/cat.png?ex=old&hm=expired' } }] });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ embeds: [{ description: 'After', image: { url: 'https://cdn.discordapp.com/attachments/1/111/cat.png' } }] });
  });

  it('appends an upload without dropping a hidden rich image or reusing its filename', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"789"}')); vi.stubGlobal('fetch', fetch);
    await editMessage(webhook, '789', { embeds: [{ description: 'After', image: { url: 'https://cdn.discordapp.com/attachments/1/111/upload_0.png?ex=old&hm=old' }, thumbnail: { url: 'blob:new' } }] }, [
      { file: new File(['cat'], 'cat.png'), previewUrl: 'blob:new', fieldKey: 'embed_thumbnail' },
    ]);
    const body = fetch.mock.calls[0][1].body as FormData;
    expect(JSON.parse(String(body.get('payload_json')))).toEqual({ embeds: [{ description: 'After', image: { url: 'https://cdn.discordapp.com/attachments/1/111/upload_0.png' }, thumbnail: { url: 'attachment://upload_1.png' } }] });
    expect((body.get('files[0]') as File).name).toBe('upload_1.png');
  });
  it('rejects oversized uploads before making a send or edit request', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const attachments = [{ file: { name: 'video.mp4', size: MAX_UPLOAD_BYTES + 1 } as File, previewUrl: 'blob:video', fieldKey: 'content_file_0' }];
    for (const result of [await sendMessage(webhook, { content: 'Upload' }, attachments), await editMessage(webhook, '789', { content: 'Upload' }, attachments)]) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('20 MiB');
      expect(result.discordApiError?.details[0].path).toBe('attachments');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('allows description edits to retain a large existing Discord attachment', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"789"}')); vi.stubGlobal('fetch', fetch);
    const retained = { file: { name: 'old.pdf', size: MAX_UPLOAD_BYTES + 1 } as File, previewUrl: 'https://cdn.discordapp.com/attachments/1/2/old.pdf', fieldKey: 'content_file_0', discordId: '2', name: 'old.pdf' };
    expect((await editMessage(webhook, '789', { content: 'Updated', attachments: [{ id: '2' }] }, [retained])).success).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ content: 'Updated', attachments: [{ id: '2' }] });
  });

  it('keeps thread query parameters when sending', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"789"}'));
    vi.stubGlobal('fetch', fetch);
    expect((await sendMessage(webhook, { content: 'Hello' })).success).toBe(true);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get('thread_id')).toBe('456');
    expect(url.searchParams.get('wait')).toBe('true');
  });

  it('clears removed text, embeds and suppression flags during an update', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"789"}'));
    vi.stubGlobal('fetch', fetch);
    await editMessage(webhook, '789', { content: '', embeds: [], components: [], flags: 0 });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ content: '', embeds: [], components: [], flags: 0 });
    expect(fetch.mock.calls[0][0]).toBe('https://discord.com/api/webhooks/123/token/messages/789?thread_id=456&with_components=true');
  });

  it('keeps omitted fields out of a description-only edit', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"789"}'));
    vi.stubGlobal('fetch', fetch);
    await editMessage(webhook, '789', { embeds: [{ description: 'Updated' }] });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ embeds: [{ description: 'Updated' }] });
  });

  it('sends the one-way V2 conversion with null content and components enabled', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"789"}'));
    vi.stubGlobal('fetch', fetch);
    await editMessage(webhook, '789', { content: null, embeds: [], components: [{ type: 10, content: 'Converted' }], flags: 32768 });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ content: null, embeds: [], components: [{ type: 10, content: 'Converted' }], flags: 32768 });
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('with_components')).toBe('true');
  });

  it('retains named attachments when removing a loaded file', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"789"}'));
    vi.stubGlobal('fetch', fetch);
    await editMessage(webhook, '789', { attachments: [{ id: '111' }] });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ attachments: [{ id: '111' }] });
  });

  it('includes retained and new files in a multipart edit', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"789"}'));
    vi.stubGlobal('fetch', fetch);
    const file = new File(['cat'], 'cat.png', { type: 'image/png' });
    await editMessage(webhook, '789', { attachments: [{ id: '111' }] }, [
      { file, previewUrl: 'blob:cat', fieldKey: 'content_file_1' },
    ]);
    const body = fetch.mock.calls[0][1].body as FormData;
    expect(JSON.parse(String(body.get('payload_json')))).toEqual({
      attachments: [{ id: '111' }, { id: 0, filename: 'upload_0.png' }],
    });
    expect(body.get('files[0]')).toBeInstanceOf(File);
  });

  it('enables components for sending and editing while preserving other query parameters', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"789"}'));
    vi.stubGlobal('fetch', fetch);
    const payload = { flags: 32768, components: [{ type: 10 as const, content: 'Hello from components' }] };
    await sendMessage(webhook, payload);
    await editMessage(webhook, '789', payload);
    for (const call of fetch.mock.calls) {
      const url = new URL(call[0]);
      expect(url.searchParams.get('with_components')).toBe('true');
      expect(url.searchParams.get('thread_id')).toBe('456');
      expect(JSON.parse(call[1].body)).toMatchObject(payload);
    }
  });

  it('builds load and delete URLs without appending the message path to a query', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"id":"789"}')));
    vi.stubGlobal('fetch', fetch);
    await loadMessage(webhook, '789');
    await deleteMessage(webhook, '789');
    for (const call of fetch.mock.calls) expect(new URL(call[0]).pathname).toBe('/api/webhooks/123/token/messages/789');
  });

  it('edits a rich embed description without re-sending an automatic image preview', async () => {
    const original = {
      id: '789',
      webhook_id: '123',
      content: 'An update with an image link: https://example.com/photo.png',
      embeds: [
        {
          type: 'rich',
          title: 'Update',
          description: 'Before',
          thumbnail: { url: 'https://cdn.discordapp.com/attachments/1/thumb.png', proxy_url: 'https://media.discordapp.net/attachments/1/thumb.png' },
        },
        {
          type: 'image',
          url: 'https://example.com/photo.png',
          image: { url: 'https://example.com/photo.png' },
        },
      ],
      attachments: [],
    };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(original)))
      .mockResolvedValueOnce(new Response('{"id":"789"}'));
    vi.stubGlobal('fetch', fetch);

    const loaded = await loadMessage(webhook, '789');
    expect(loaded.valid).toBe(true);
    const message = parseDiscordPayloadToMessage(loaded.data!);
    expect(message.embeds).toHaveLength(1);
    message.embeds[0].description = 'After';
    expect((await editMessage(webhook, '789', buildPayload(message))).success).toBe(true);

    const patch = JSON.parse(fetch.mock.calls[1][1].body);
    expect(patch.embeds).toEqual([{
      title: 'Update',
      description: 'After',
      thumbnail: { url: 'https://cdn.discordapp.com/attachments/1/thumb.png' },
    }]);
    expect(patch.embeds[0].image).toBeUndefined();
    expect(fetch.mock.calls[1][1].method).toBe('PATCH');
  });
});
