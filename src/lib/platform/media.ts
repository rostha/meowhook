import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDatabase } from './database';
import { PlatformError } from './http';

export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
export interface StoredMedia { id: string; ownerId: string; name: string; size: number; type: string; blobUrl?: string; pathname?: string; ready: boolean }
export function validMedia(file: { name: string; size: number; type: string }) {
  if (!file || typeof file !== 'object' || typeof file.name !== 'string' || !file.name || file.name.length > 255 || /[\x00-\x1F\x7F/\\]/.test(file.name)) throw new PlatformError('Choose a file with a valid filename.');
  if (!Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_MEDIA_BYTES) throw new PlatformError('Choose a file up to 20 MiB.', 413);
  if (typeof file.type !== 'string' || !file.type || file.type.length > 100 || /[\r\n]/.test(file.type)) throw new PlatformError('This file type is invalid.');
}
export async function registerMedia(ownerId: string, file: { name: string; size: number; type: string }, id: string = randomUUID(), pathname?: string) {
  validMedia(file);
  const db = getDatabase();
  const recent = await db.selectFrom('platform_resource').select(db.fn.countAll<number>().as('count')).where('owner_id', '=', ownerId).where('kind', '=', 'media')
    .where('created_at', '>', new Date(Date.now() - 86_400_000).toISOString()).executeTakeFirstOrThrow();
  if (Number(recent.count) >= 100) throw new PlatformError('Daily upload limit reached. Try again tomorrow.', 429);
  // Direct-upload metadata is untrusted JSON. Never spread its identity/storage fields.
  const media: StoredMedia = { id, ownerId, name: file.name, size: file.size, type: file.type, ready: false, ...(pathname ? { pathname } : {}) };
  const now = new Date().toISOString();
  await db.insertInto('platform_resource').values({ id, owner_id: ownerId, guild_id: '', kind: 'media', data: JSON.stringify(media), revision: 1, created_at: now, updated_at: now }).execute();
  return media;
}
export async function getMedia(id: string, ownerId?: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  let query = getDatabase().selectFrom('platform_resource').select('data').where('kind', '=', 'media').where('id', '=', id);
  if (ownerId) query = query.where('owner_id', '=', ownerId);
  const row = await query.executeTakeFirst();
  return row ? JSON.parse(row.data) as StoredMedia : null;
}
export async function completeMedia(media: StoredMedia) {
  const saved = { ...media, ready: true };
  await getDatabase().updateTable('platform_resource').set({ data: JSON.stringify(saved), updated_at: new Date().toISOString() }).where('id', '=', media.id).where('owner_id', '=', media.ownerId).where('kind', '=', 'media').execute();
  return saved;
}
export async function writeLocalMedia(media: StoredMedia, bytes: Uint8Array) {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new PlatformError('Upload storage is not configured.', 503);
  if (bytes.byteLength !== media.size) throw new PlatformError('The file size changed during upload.');
  const directory = resolve('.data/media'); await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, media.id), bytes, { flag: 'wx' });
  return completeMedia(media);
}
export async function mediaBytes(media: StoredMedia): Promise<Uint8Array> {
  if (!media.ready) throw new PlatformError('This file has not finished uploading.', 409);
  if (!media.blobUrl) {
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new PlatformError('This uploaded file is unavailable.', 404);
    return readFile(resolve('.data/media', media.id));
  }
  const url = new URL(media.blobUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.public.blob.vercel-storage.com')) throw new PlatformError('This uploaded file is unavailable.', 404);
  const result = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!result.ok || Number(result.headers.get('content-length') || 0) > MAX_MEDIA_BYTES) throw new PlatformError('This uploaded file is unavailable.', 404);
  const reader = result.body?.getReader(); if (!reader) throw new PlatformError('The uploaded file is empty.');
  const chunks: Uint8Array[] = []; let length = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length;
    if (length > MAX_MEDIA_BYTES) { await reader.cancel(); throw new PlatformError('This file exceeds the upload limit.', 413); } chunks.push(value); }
  return Buffer.concat(chunks);
}
export function mediaPublicUrl(requestUrl: string, media: StoredMedia) { return new URL(`/api/platform/media/${media.id}`, requestUrl).href; }
export function mediaIdFromUrl(value: string): string | null {
  try { const url = new URL(value); return /^\/api\/platform\/media\/([a-f0-9-]{36})$/.exec(url.pathname)?.[1] || null; } catch { return null; }
}
