'use client';
import type { FileAttachment, Message } from '@/lib/types';
import { uploadPlatformMedia } from './mediaClient';

async function copyDiscordFile(attachment: FileAttachment): Promise<File> {
  let url: URL;
  try { url = new URL(attachment.previewUrl); } catch { throw new Error('One of this message’s files needs to be uploaded again.'); }
  if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) || !url.pathname.startsWith('/attachments/') || url.username || url.password || url.port) {
    throw new Error('One of this message’s files needs to be uploaded again.');
  }
  // Runs in the browser: no server-side fetching of arbitrary remote file URLs.
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error('A Discord file link is no longer available. Load the current message from Discord or upload the file again.');
  const limit = 20 * 1024 * 1024;
  if (Number(response.headers.get('content-length') || 0) > limit) throw new Error('Choose a file up to 20 MiB.');
  const reader = response.body?.getReader(); if (!reader) throw new Error('The Discord file is empty.');
  const chunks: Uint8Array[] = []; let length = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length;
    if (length > limit) { await reader.cancel(); throw new Error('Choose a file up to 20 MiB.'); } chunks.push(value); }
  if (!length) throw new Error('The Discord file is empty.');
  return new File(chunks.map(chunk => new Uint8Array(chunk)), attachment.name || decodeURIComponent(url.pathname.split('/').pop()!) || 'file',
    { type: attachment.mimeType || response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream' });
}

/** Only media locations change; matching text, labels and link destinations stay literal. */
function replaceUrls(message: Message, urls: Map<string, string>): Message {
  const url = (value: string) => urls.get(value) ?? value;
  const blocks = (values: NonNullable<Message['componentBlocks']>): NonNullable<Message['componentBlocks']> => values.map(block =>
    block.type === 'container' ? { ...block, blocks: blocks(block.blocks) } : block.type === 'gallery'
      ? { ...block, items: block.items.map(item => ({ ...item, url: url(item.url) })) }
      : block.type === 'section' || block.type === 'file' ? { ...block, url: url(block.url) } : block);
  return { ...message, avatar_url: url(message.avatar_url), embeds: message.embeds.map(embed => ({ ...embed,
    image: { ...embed.image, url: url(embed.image.url) }, thumbnail: { ...embed.thumbnail, url: url(embed.thumbnail.url) },
    author: { ...embed.author, icon_url: url(embed.author.icon_url) }, footer: { ...embed.footer, icon_url: url(embed.footer.icon_url) },
  })), componentBlocks: message.componentBlocks ? blocks(message.componentBlocks) : undefined,
    _attachments: message._attachments?.map(attachment => ({ ...attachment, previewUrl: url(attachment.previewUrl) })) };
}
/** Retain durable attachment metadata and strip every browser-only file handle. */
export async function persistEditorMedia(message: Message): Promise<Message> {
  const urls = new Map<string, string>(); const ids = new Map<string, string>();
  const uploads = new Map<File, Awaited<ReturnType<typeof uploadPlatformMedia>>>();
  const metadata = new Map<string, Awaited<ReturnType<typeof uploadPlatformMedia>>>();
  const fileRefs = new Set<string>();
  const collectFiles = (blocks: NonNullable<Message['componentBlocks']>) => { for (const block of blocks) { if (block.type === 'container') collectFiles(block.blocks); else if (block.type === 'file') fileRefs.add(block.url); } };
  collectFiles(message.componentBlocks || []);
  const retained: FileAttachment[] = [];
  for (const original of message._attachments || []) {
    let attachment = original;
    const hosted = /^https?:\/\/[^/]+\/api\/platform\/media\/[a-f0-9-]{36}$/.test(attachment.previewUrl);
    if (!attachment.file && !hosted) {
      const requiredBytes = attachment.fieldKey.startsWith('content_file') || fileRefs.has(attachment.previewUrl) || (attachment.name && fileRefs.has(`attachment://${attachment.name}`));
      if (!requiredBytes) continue; // Public avatar/embedded image URLs remain usable without file metadata.
      attachment = { ...attachment, file: await copyDiscordFile(attachment), platformMediaId: undefined };
    }
    retained.push(attachment);
    if (!attachment.file || urls.has(attachment.previewUrl)) continue;
    const existing = attachment.platformMediaId && /^[a-f0-9-]{36}$/.test(attachment.platformMediaId)
      ? new URL(`/api/platform/media/${attachment.platformMediaId}`, window.location.origin).href : undefined;
    let result = uploads.get(attachment.file);
    if (!result) {
      result = existing ? { url: existing, name: attachment.name || attachment.file.name, size: attachment.file.size, type: attachment.file.type }
        : await uploadPlatformMedia(attachment.file);
      uploads.set(attachment.file, result);
    }
    urls.set(attachment.previewUrl, result.url);
    ids.set(result.url, new URL(result.url).pathname.split('/').pop()!);
    metadata.set(result.url, result);
    if (attachment.name) urls.set(`attachment://${attachment.name}`, result.url);
  }
  const updated = replaceUrls({ ...message, _attachments: retained }, urls);
  return { ...updated, loadedFromMessageId: undefined, loadedAttachmentIds: undefined, loadedPayload: undefined, sentBlobUrls: undefined,
    _attachments: updated._attachments?.map(({ file: _file, fileId: _fileId, discordId: _discordId, ...attachment }) => ({
      ...attachment, ...(metadata.has(attachment.previewUrl) ? { name: metadata.get(attachment.previewUrl)!.name,
        size: metadata.get(attachment.previewUrl)!.size, mimeType: metadata.get(attachment.previewUrl)!.type } : {}),
      platformMediaId: ids.get(attachment.previewUrl) || attachment.platformMediaId,
    })) };
}
/** The standalone webhook editor needs bytes, rather than dashboard-only file references. */
export async function materializeEditorMedia(message: Message, signal?: AbortSignal): Promise<Message> {
  const urls = new Map<string, string>();
  const created: string[] = [];
  const results = await Promise.allSettled((message._attachments || []).map(async attachment => {
    const url = new URL(attachment.previewUrl, window.location.origin);
    if (url.origin !== window.location.origin || !/^\/api\/platform\/media\/[a-f0-9-]{36}$/.test(url.pathname)) throw new Error('One of this message’s files needs to be uploaded again.');
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('One of this message’s uploaded files is unavailable.');
    const blob = await response.blob();
    const file = new File([blob], attachment.name || 'file', { type: attachment.mimeType || blob.type });
    const previewUrl = URL.createObjectURL(file); created.push(previewUrl); urls.set(attachment.previewUrl, previewUrl);
    return { ...attachment, file, previewUrl, platformMediaId: url.pathname.split('/').pop()!, fileId: undefined, discordId: undefined };
  }));
  const failure = results.find(result => result.status === 'rejected');
  if (failure || signal?.aborted) {
    for (const url of created) URL.revokeObjectURL(url);
    throw failure?.status === 'rejected' ? failure.reason : new DOMException('Opening the message was cancelled.', 'AbortError');
  }
  const attachments = results.map(result => (result as PromiseFulfilledResult<NonNullable<Message['_attachments']>[number]>).value);
  return { ...replaceUrls(message, urls), _attachments: attachments };
}
