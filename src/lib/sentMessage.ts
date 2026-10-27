import type { Embed, Message } from './types';
import { buildPayload } from './payload';
import { parseDiscordPayloadToMessage } from './utils';
import { activeMessageAttachments, mapBlockMedia } from './componentAttachments';
import { safeFileName as uploadName } from './webhook';
import { discordMessageAttachments } from './discordAttachments';

/** Keep a reusable draft while recording which local uploads belong to the message just sent. */
export function reconcileSentMessage(current: Message, sent: Message, data: Record<string, unknown>): Message {
  if (typeof data.id !== 'string' || !Array.isArray(data.embeds) || !Array.isArray(data.attachments)) return current;
  const originals = activeMessageAttachments(sent).filter((attachment) => attachment.fieldKey !== 'avatar' && attachment.previewUrl.startsWith('blob:') && attachment.file);
  const sentBlobUrls = originals.map((attachment) => attachment.previewUrl);
  const attachmentIds = new Map<string, string>();
  for (const attachment of discordMessageAttachments(data)) {
    if (!attachment || typeof attachment !== 'object') continue;
    const item = attachment as Record<string, unknown>;
    if (typeof item.filename === 'string' && typeof item.id === 'string') attachmentIds.set(item.filename, item.id);
  }
  const updatedAttachments = current._attachments?.map((attachment) => {
    const index = originals.findIndex((original) => original.previewUrl === attachment.previewUrl);
    if (index < 0 || !attachment.file) return attachment;
    const name = uploadName(attachment.file, index);
    return { ...attachment, name, discordId: attachmentIds.get(name) };
  });

  const richEmbeds = data.embeds.filter((value): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && (value as Record<string, unknown>).type === 'rich'
  );
  const mediaUrl = (value: unknown, key: 'url' | 'icon_url'): string | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const url = (value as Record<string, unknown>)[key];
    return typeof url === 'string' && url ? url : undefined;
  };
  const updatedEmbeds = current.embeds.map((embed, index): Embed => {
    const source = sent.embeds[index];
    const returned = richEmbeds[index];
    if (!source || !returned) return embed;
    const next = { ...embed, image: { ...embed.image }, thumbnail: { ...embed.thumbnail }, author: { ...embed.author }, footer: { ...embed.footer } };
    for (const field of ['image', 'thumbnail'] as const) {
      const localUrl = source[field].url;
      const remoteUrl = mediaUrl(returned[field], 'url');
      if (localUrl.startsWith('blob:') && embed[field].url === localUrl && remoteUrl) next[field].url = remoteUrl;
    }
    for (const field of ['author', 'footer'] as const) {
      const localUrl = source[field].icon_url;
      const remoteUrl = mediaUrl(returned[field], 'icon_url');
      if (localUrl.startsWith('blob:') && embed[field].icon_url === localUrl && remoteUrl) next[field].icon_url = remoteUrl;
    }
    return next;
  });
  const loaded = parseDiscordPayloadToMessage(data);
  return {
    ...current,
    embeds: updatedEmbeds,
    componentBlocks: current.componentBlocks ? mapBlockMedia(current.componentBlocks, new Map(originals.flatMap((attachment, index) => attachmentIds.has(uploadName(attachment.file!, index)) ? [[attachment.previewUrl, `attachment://${uploadName(attachment.file!, index)}`]] : []))) : undefined,
    _attachments: updatedAttachments,
    loadedFromMessageId: data.id,
    loadedAttachmentIds: loaded.loadedAttachmentIds,
    loadedPayload: buildPayload(loaded),
    sentBlobUrls,
  };
}
