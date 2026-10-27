import type { DiscordWebhookEditPayload, DiscordWebhookPayload, Message } from './types';
import { activeMessageAttachments } from './componentAttachments';
import { COMPONENTS_V2_FLAG } from './messageComponents';
import { normalizeDiscordMediaPayload } from './discordMedia';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function editBaseline(message: Message, messageId: string, current: DiscordWebhookPayload): DiscordWebhookPayload {
  return message.loadedFromMessageId === messageId && message.loadedPayload ? message.loadedPayload : current;
}

/** PATCH only the parts the editor changed, so an embed edit cannot reparse message mentions. */
export function buildEditPatch(previous: DiscordWebhookPayload, next: DiscordWebhookPayload): DiscordWebhookEditPayload {
  previous = normalizeDiscordMediaPayload(previous);
  next = normalizeDiscordMediaPayload(next);
  const patch: DiscordWebhookEditPayload = {};
  const isV2 = ((next.flags ?? 0) & COMPONENTS_V2_FLAG) !== 0;
  const wasV2 = ((previous.flags ?? 0) & COMPONENTS_V2_FLAG) !== 0;

  if (isV2 && !wasV2) {
    return { content: null, embeds: [], components: next.components ?? [], flags: COMPONENTS_V2_FLAG };
  }

  if (!isV2) {
    if ((previous.content ?? '') !== (next.content ?? '')) patch.content = next.content ?? '';
    if (!same(previous.embeds ?? [], next.embeds ?? [])) patch.embeds = next.embeds ?? [];
  }
  if (!same(previous.components ?? [], next.components ?? [])) patch.components = next.components ?? [];

  const editableFlags = isV2 ? COMPONENTS_V2_FLAG : 4;
  if (((previous.flags ?? 0) & editableFlags) !== ((next.flags ?? 0) & editableFlags)) {
    patch.flags = (next.flags ?? 0) & editableFlags;
  }
  return patch;
}

/** Identify intentional removal of a file from a message loaded into this draft. */
export function retainedAttachmentIdsForEdit(
  message: Message,
  messageId: string,
  currentIds: string[],
): { ids: string[]; conflict: boolean } | null {
  if (message.loadedFromMessageId !== messageId || !message.loadedAttachmentIds?.length) return null;
  const kept = new Set(activeMessageAttachments(message).map((attachment) => attachment.discordId).filter((id): id is string => !!id));
  const removed = message.loadedAttachmentIds.some((id) => !kept.has(id));
  if (!removed) return null;
  const originalIds = new Set(message.loadedAttachmentIds);
  const conflict = currentIds.length !== originalIds.size || currentIds.some((id) => !originalIds.has(id));
  return { ids: currentIds.filter((id) => kept.has(id)), conflict };
}

/** Discord omits files used inside embeds from its visible attachments list. */
export function hasEmbeddedDiscordUpload(data: Record<string, unknown>): boolean {
  if (!Array.isArray(data.embeds)) return false;
  return data.embeds.some((embed) => {
    if (!embed || typeof embed !== 'object') return false;
    const item = embed as Record<string, unknown>;
    if (item.type !== undefined && item.type !== 'rich') return false;
    return ['image', 'thumbnail', 'author', 'footer'].some((field) => {
      const value = item[field];
      if (!value || typeof value !== 'object') return false;
      const media = value as Record<string, unknown>;
      const url = field === 'author' || field === 'footer' ? media.icon_url : media.url;
      if (typeof url !== 'string') return false;
      if (url.startsWith('attachment://')) return true;
      try {
        const parsed = new URL(url);
        return (parsed.hostname === 'cdn.discordapp.com' || parsed.hostname === 'media.discordapp.net') && parsed.pathname.startsWith('/attachments/');
      } catch {
        return false;
      }
    });
  });
}
