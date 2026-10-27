import { createHash } from 'node:crypto';
import { AVATAR_IMAGE_TYPES, MAX_AVATAR_BYTES, avatarUploadError } from './avatarUpload';

export class AvatarUploadError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function validateAvatarUpload(pathname: string, clientPayload: string | null) {
  if (!/^avatars\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/.test(pathname)) throw new AvatarUploadError('Invalid avatar upload path.');
  let body;
  try { body = JSON.parse(clientPayload ?? '{}'); } catch { throw new AvatarUploadError('Invalid upload request.'); }
  if (!body || typeof body !== 'object') throw new AvatarUploadError('Invalid upload request.');
  const error = avatarUploadError({ size: body.size, type: body.contentType });
  if (error) throw new AvatarUploadError(error);
  const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
  if (!pathname.endsWith('.' + extensions[body.contentType])) throw new AvatarUploadError('The file type does not match this image.');
  let webhook: URL;
  try { webhook = new URL(body.webhookUrl); } catch { throw new AvatarUploadError('Connect a webhook before uploading an avatar.', 401); }
  if (webhook.protocol !== 'https:' || !['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com'].includes(webhook.hostname) || webhook.port || webhook.username || webhook.password || !/^\/api\/(?:v10\/)?webhooks\/\d{17,20}\/[A-Za-z0-9_-]{20,200}$/.test(webhook.pathname)) {
    throw new AvatarUploadError('Use a valid Discord webhook to upload an avatar.', 401);
  }
  webhook.hostname = 'discord.com'; webhook.search = ''; webhook.hash = '';
  return { webhook, contentType: body.contentType as string };
}

/** Shared, expiring counters protect public image hosting across server instances. */
export async function limitAvatarUploads(ip: string) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID, namespace = process.env.CLOUDFLARE_KV_NAMESPACE_ID, token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !namespace || !token) throw new AvatarUploadError('Avatar uploads are temporarily unavailable. Use an image URL instead.', 503);
  const window = Math.floor(Date.now() / 3_600_000);
  const fingerprint = createHash('sha256').update(token + ':' + ip).digest('hex').slice(0, 24);
  const buckets = [{ key: `__avatar_upload__:ip:${fingerprint}:${window}`, max: 12 }, { key: `__avatar_upload__:global:${window}`, max: 120 }];
  try {
    for (const bucket of buckets) {
      const url = `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}/values/${encodeURIComponent(bucket.key)}`;
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' };
      const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok && response.status !== 404) throw new Error('Counter unavailable');
      const count = response.ok ? Number(await response.text()) : 0;
      if (!Number.isFinite(count)) throw new Error('Invalid counter');
      if (count >= bucket.max) throw new AvatarUploadError('Upload limit reached. Try again in an hour or use an image URL.', 429);
      const saved = await fetch(url + '?expiration_ttl=7200', { method: 'PUT', headers, body: String(count + 1), signal: AbortSignal.timeout(8000) });
      if (!saved.ok) throw new Error('Counter unavailable');
    }
  } catch (error) {
    if (error instanceof AvatarUploadError) throw error;
    throw new AvatarUploadError('Avatar uploads are temporarily unavailable. Try again shortly.', 503);
  }
}

export async function authorizeAvatarUpload(webhook: URL) {
  let response: Response;
  try { response = await fetch(webhook, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) }); }
  catch { throw new AvatarUploadError('Could not verify your webhook. Try again shortly.', 503); }
  if (response.status === 429) throw new AvatarUploadError('Discord is busy. Wait a moment before uploading.', 429);
  if (!response.ok) throw new AvatarUploadError('Your webhook could not be verified. Check its URL above.', 401);
  const data = await response.json().catch(() => ({}));
  if (data.type !== 1 || data.id !== webhook.pathname.split('/').at(-2)) throw new AvatarUploadError('Use an incoming Discord webhook to upload an avatar.', 401);
}

export function avatarTokenOptions(contentType: string) {
  return {
    maximumSizeInBytes: MAX_AVATAR_BYTES,
    allowedContentTypes: AVATAR_IMAGE_TYPES.filter(type => type === contentType),
    validUntil: Date.now() + 5 * 60_000,
    allowOverwrite: false,
    addRandomSuffix: false,
    cacheControlMaxAge: 31_536_000,
  };
}
