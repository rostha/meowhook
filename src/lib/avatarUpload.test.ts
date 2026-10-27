import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { avatarUploadError, avatarUploadPath, MAX_AVATAR_BYTES } from './avatarUpload';
import { authorizeAvatarUpload, avatarTokenOptions, limitAvatarUploads, validateAvatarUpload } from './avatarUploadServer';
import { POST } from '@/app/api/avatar/upload/route';
import { getPayloadFromClientToken } from '@vercel/blob/client';
import { syncAvatarPreviewAttachment } from '@/components/editor/helpers';
import { createDefaultMessage } from './utils';

const id = '123456789012345678';
const webhookUrl = `https://discord.com/api/webhooks/${id}/${'a'.repeat(68)}`;
const pathname = avatarUploadPath('image/png', '12345678-1234-1234-1234-123456789012');
const payload = (override = {}) => JSON.stringify({ size: MAX_AVATAR_BYTES, contentType: 'image/png', webhookUrl, ...override });

describe('avatar uploads', () => {
  beforeEach(() => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_test_test');
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'account');
    vi.stubEnv('CLOUDFLARE_KV_NAMESPACE_ID', 'namespace');
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'secret');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('accepts exactly 8 MiB and rejects larger, empty, and unsupported files', () => {
    expect(avatarUploadError({ size: MAX_AVATAR_BYTES, type: 'image/png' })).toBeNull();
    expect(avatarUploadError({ size: MAX_AVATAR_BYTES + 1, type: 'image/png' })).toMatch(/8 MB/);
    expect(avatarUploadError({ size: 0, type: 'image/png' })).toMatch(/empty/);
    expect(avatarUploadError({ size: 50, type: 'image/svg+xml' })).toMatch(/PNG/);
    expect(avatarUploadError({ size: 50, type: 'text/html' })).toMatch(/PNG/);
  });

  it('enforces size and MIME constraints on the server and storage token', () => {
    expect(validateAvatarUpload(pathname, payload()).contentType).toBe('image/png');
    expect(() => validateAvatarUpload(pathname, payload({ size: MAX_AVATAR_BYTES + 1 }))).toThrow(/8 MB/);
    expect(() => validateAvatarUpload(pathname, payload({ contentType: 'image/jpeg' }))).toThrow(/match/);
    expect(() => validateAvatarUpload('../avatar.png', payload())).toThrow(/path/);
    expect(avatarTokenOptions('image/png')).toMatchObject({ maximumSizeInBytes: MAX_AVATAR_BYTES, allowedContentTypes: ['image/png'], allowOverwrite: false, addRandomSuffix: false });
    expect(avatarTokenOptions('image/png').validUntil - Date.now()).toBeLessThanOrEqual(300000);
  });

  it.each(['http://discord.com', 'https://discord.com.example.com', 'https://127.0.0.1', 'https://example.com@discord.com', 'https://discord.com:444'])('rejects unsafe webhook origin %s', origin => {
    expect(() => validateAvatarUpload(pathname, payload({ webhookUrl: webhookUrl.replace('https://discord.com', origin) }))).toThrow(/webhook/);
  });

  it('canonicalizes supported Discord hosts and strips query parameters', () => {
    const result = validateAvatarUpload(pathname, payload({ webhookUrl: webhookUrl.replace('discord.com', 'discordapp.com') + '?wait=true#extra' }));
    expect(result.webhook.href).toBe(webhookUrl);
  });

  it('only reads the webhook to authorize an upload and refuses invalid credentials', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ id, type: 1 })).mockResolvedValueOnce(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetcher);
    await authorizeAvatarUpload(new URL(webhookUrl));
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', cache: 'no-store' });
    expect(fetcher.mock.calls[0][1].method).toBeUndefined();
    await expect(authorizeAvatarUpload(new URL(webhookUrl))).rejects.toMatchObject({ status: 401 });
  });

  it('fails closed when rate limiting is unavailable or exhausted', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('12')).mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    await expect(limitAvatarUploads('127.0.0.1')).rejects.toMatchObject({ status: 429 });
    await expect(limitAvatarUploads('127.0.0.2')).rejects.toMatchObject({ status: 503 });
  });

  it('rejects cross-origin and oversized requests before any network access', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const request = (origin: string, clientPayload: string) => new Request('https://www.meowhook.com/api/avatar/upload', { method: 'POST', headers: { origin }, body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname, clientPayload } }) });
    expect((await POST(request('https://other.example', payload()))).status).toBe(403);
    expect((await POST(request('https://www.meowhook.com', payload({ size: MAX_AVATAR_BYTES + 1 })))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('issues a restricted upload token only after verifying the webhook, without embedding credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, options?: RequestInit) => {
      if (String(url).startsWith('https://discord.com/')) return Response.json({ id, type: 1 });
      return options?.method === 'PUT' ? new Response('ok') : new Response('', { status: 404 });
    }));
    const response = await POST(new Request('https://www.meowhook.com/api/avatar/upload', { method: 'POST', headers: { origin: 'https://www.meowhook.com' }, body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname, clientPayload: payload() } }) }));
    expect(response.status).toBe(200);
    const body = await response.json();
    const token = getPayloadFromClientToken(body.clientToken);
    expect(token).toMatchObject({ pathname, maximumSizeInBytes: MAX_AVATAR_BYTES, allowedContentTypes: ['image/png'], allowOverwrite: false });
    expect(JSON.stringify(token)).not.toContain(webhookUrl);
    expect(token.onUploadCompleted).toBeUndefined();
  });

  it('keeps unrelated files when replacing or clearing a hosted avatar', () => {
    const file = { fieldKey: 'component_file_test', previewUrl: 'https://example.com/file.png', name: 'file.png' };
    const avatar = { fieldKey: 'avatar', previewUrl: 'https://example.com/avatar.png', name: 'avatar.png', size: 1000 };
    const message = { ...createDefaultMessage(), _attachments: [file] };
    const next = syncAvatarPreviewAttachment(message, avatar.previewUrl, avatar);
    expect(next.avatar_url).toBe(avatar.previewUrl);
    expect(next._attachments).toEqual([file, avatar]);
    expect(syncAvatarPreviewAttachment(next, '')._attachments).toEqual([file]);
  });
});
