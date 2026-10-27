import type { Message, DiscordWebhookPayload, DiscordEmbedPayload, DiscordEmbedAuthorPayload, DiscordEmbedFooterPayload } from './types';
import { isComponentsV2, buildComponentBlocks, buildLinkRows, validateComponentBlocks, validateLinkButtons, COMPONENTS_V2_FLAG } from './messageComponents';
import { expandDiscordInputEscapes, normalizeDiscordEmbedFieldText } from './markdown';
import { activeMessageAttachments } from './componentAttachments';
import { DISCORD_ATTACHMENT_LIMIT } from './attachmentTracker';
import { getUploadSizeError } from './uploadLimits';
import { normalizeDiscordMediaPayload } from './discordMedia';

/** User filled only one side of a field row — Discord expects both name and value. */
export function sourceFieldIsPartial(f: { name: string; value: string }): boolean {
  const n = (f.name ?? '').trim();
  const v = (f.value ?? '').trim();
  if (!n && !v) return false;
  return !n || !v;
}

/** Built payload field counts as content only if both sides have non-whitespace text (ignores lone ZWSP). */
export function discordFieldIsComplete(f: { name: string; value: string }): boolean {
  const nameOk = (f.name ?? '').replace(/\u200b/g, '').trim().length > 0;
  const valOk = (f.value ?? '').replace(/\u200b/g, '').trim().length > 0;
  return nameOk && valOk;
}

/** First partial field across the sequence, or null if every field row is empty or complete. */
export function getEmbedPartialFieldBlockingReason(messages: Message[]): string | null {
  for (let mi = 0; mi < messages.length; mi++) {
    if (isComponentsV2(messages[mi])) continue;
    const embeds = messages[mi].embeds ?? [];
    for (let ei = 0; ei < embeds.length; ei++) {
      const fields = embeds[ei].fields ?? [];
      for (let fi = 0; fi < fields.length; fi++) {
        if (sourceFieldIsPartial(fields[fi])) {
          return `Field row incomplete\nMessage ${mi + 1}, embed ${ei + 1}: field ${fi + 1} needs both a name and a value.`;
        }
      }
    }
  }
  return null;
}

/** 1-based indices of embeds that would serialize to `{}`. Discord rejects these. */
export function getEmptyBuiltEmbedIndices(payload: DiscordWebhookPayload): number[] {
  if (!payload.embeds?.length) return [];
  const empty: number[] = [];
  payload.embeds.forEach((e, i) => {
    if (Object.keys(e).length === 0) empty.push(i + 1);
  });
  return empty;
}

/** True if the built embed has something Discord visibly renders (not only color). */
export function builtEmbedHasRenderableContent(e: DiscordEmbedPayload): boolean {
  if (e.title?.trim()) return true;
  if (e.description?.trim()) return true;
  if (e.url) return true;
  if (e.timestamp) return true;
  if (e.author?.name?.trim()) return true;
  if (e.footer?.text?.trim()) return true;
  if (e.image?.url?.trim()) return true;
  if (e.thumbnail?.url?.trim()) return true;
  if (e.fields && e.fields.length > 0) return true;
  return false;
}

/**
 * True if the built embed has enough body to send: non-empty title or description, at least one
 * field with both name and value, or image/thumbnail URL. Color / embed URL / author / footer alone are not enough.
 */
export function builtEmbedHasSendableContent(e: DiscordEmbedPayload): boolean {
  if (e.title?.trim()) return true;
  if (e.description?.trim()) return true;
  if (e.fields?.some(discordFieldIsComplete)) return true;
  if (e.image?.url?.trim() || e.thumbnail?.url?.trim()) return true;
  return false;
}

/** 1-based indices of embeds that are non-empty JSON but lack sendable title/description/fields/media. */
export function getBuiltEmbedIndicesWithoutRenderableContent(payload: DiscordWebhookPayload): number[] {
  if (!payload.embeds?.length) return [];
  const bad: number[] = [];
  payload.embeds.forEach((e, i) => {
    if (Object.keys(e).length === 0) return;
    if (!builtEmbedHasSendableContent(e)) bad.push(i + 1);
  });
  return bad;
}

/** First line = short headline; following lines = detail (for action-bar hint + toasts). */
export function splitSendBlockingReason(reason: string): { headline: string; detail: string } {
  const i = reason.indexOf('\n');
  if (i === -1) return { headline: reason.trim(), detail: '' };
  return { headline: reason.slice(0, i).trim(), detail: reason.slice(i + 1).trim() };
}

/**
 * Returns a user-facing reason if the batch cannot be sent, or null if send is allowed
 * (excluding webhook URL validity).
 *
 * A message may send if it has: trimmed message text, at least one attachment, or at least one
 * embed with title, description, a complete field (name + value), image, or thumbnail.
 * Partial embed fields (only name or only value) block until fixed.
 */
export function getSendBlockingReason(
  messages: Message[],
  attachmentTotals: number[]
): string | null {
  if (messages.length === 0) return 'No messages yet\nAdd a message before sending.';
  if (messages.length > 10) return 'Too many messages\nA draft can contain up to 10 messages.';

  const partialField = getEmbedPartialFieldBlockingReason(messages);
  if (partialField) return partialField;

  for (let i = 0; i < messages.length; i++) {
    const activeAttachments = activeMessageAttachments(messages[i]);
    for (const attachment of activeAttachments) {
      if (!attachment.file || !attachment.previewUrl.startsWith('blob:') || attachment.fieldKey === 'avatar') continue;
      const sizeError = getUploadSizeError(attachment.file);
      if (sizeError) return `File too large\nMessage ${i + 1}: ${sizeError}`;
    }
    const missing = activeAttachments.find(a => (a.fileId || a.previewUrl.startsWith('local-file:')) && !a.file);
    if (missing) return `File needs re-uploading\nMessage ${i + 1}: ${missing.name || 'An uploaded file'} is not available in this browser. Re-upload it or remove it.`;
    if ((isComponentsV2(messages[i]) ? activeAttachments.length : attachmentTotals[i] ?? 0) > DISCORD_ATTACHMENT_LIMIT) {
      return `Too many uploaded attachments\nMessage ${i + 1}: Discord allows up to ${DISCORD_ATTACHMENT_LIMIT} uploaded attachments per message. Remove some uploads before sending.`;
    }

    if (messages[i].avatar_url?.startsWith('blob:')) {
      return `Avatar upload needs a real URL\nMessage ${i + 1}: uploaded avatar images only preview locally. Paste an HTTPS image URL before sending.`;
    }

    const message = messages[i];
    if (isComponentsV2(message)) {
      const issue = validateComponentBlocks(message.componentBlocks ?? [], `Message ${i + 1}`, false, activeAttachments);
      if (issue) return `Check components\n${issue}`;
      continue;
    }
    if ((message.linkButtons?.length ?? 0) > 25) return `Too many links\nMessage ${i + 1}: use up to 25 link buttons.`;
    if (message.linkButtons?.length) {
      const issue = validateLinkButtons(message.linkButtons, `Message ${i + 1}`);
      if (issue) return `Check link buttons\n${issue}`;
      if (!message.content.trim() && !message.embeds.length && (attachmentTotals[i] ?? 0) === 0) return `Links need a message\nMessage ${i + 1}: add text, an embed, or a file alongside link buttons.`;
    }
    const payload = buildPayload(message);
    const textLength = (value?: string) => (value ?? '').trim().length;
    const tooLong = (label: string, value: string | undefined, limit: number) =>
      textLength(value) > limit ? `Text is too long\nMessage ${i + 1}: ${label} allows ${limit.toLocaleString()} characters.` : null;
    const contentLimit = tooLong('message text', payload.content, 2000);
    if (contentLimit) return contentLimit;
    if ((payload.embeds?.length ?? 0) > 10) return `Too many embeds\nMessage ${i + 1}: use up to 10 embeds.`;
    let embedCharacters = 0;
    for (const [ei, embed] of (payload.embeds ?? []).entries()) {
      const label = `embed ${ei + 1}`;
      const checks: [string, string | undefined, number][] = [
        [`${label} title`, embed.title, 256],
        [`${label} description`, embed.description, 4096],
        [`${label} author name`, embed.author?.name, 256],
        [`${label} footer`, embed.footer?.text, 2048],
      ];
      if ((embed.fields?.length ?? 0) > 25) return `Too many fields\nMessage ${i + 1}, ${label}: use up to 25 fields.`;
      for (const [fi, field] of (embed.fields ?? []).entries()) {
        checks.push([`${label}, field ${fi + 1} name`, field.name, 256], [`${label}, field ${fi + 1} value`, field.value, 1024]);
      }
      for (const [name, value, limit] of checks) {
        const reason = tooLong(name, value, limit);
        if (reason) return reason;
        embedCharacters += textLength(value);
      }
    }
    if (embedCharacters > 6000) return `Embeds are too long\nMessage ${i + 1}: all embed text together must fit within 6,000 characters.`;
    const emptyEmbedSlots = getEmptyBuiltEmbedIndices(payload);
    if (emptyEmbedSlots.length > 0) {
      const n = emptyEmbedSlots.length;
      const slots = emptyEmbedSlots.join(', ');
      return `Empty embed slot\nMessage ${i + 1}, embed${n > 1 ? 's ' : ' '}${slots}: add a title, description, image, or other content—or delete the empty embed.`;
    }
    const noRenderableSlots = getBuiltEmbedIndicesWithoutRenderableContent(payload);
    if (noRenderableSlots.length > 0) {
      const slots = noRenderableSlots.join(', ');
      return `Embed needs visible content\nMessage ${i + 1}, embed ${slots}: add a title, description, complete field, or image before sending.`;
    }
    const hasAttachments = (attachmentTotals[i] ?? 0) > 0;
    const contentTrimmed = (messages[i].content ?? '').trim();
    const hasContent = contentTrimmed.length > 0;
    const hasRenderableEmbeds = (payload.embeds?.some(builtEmbedHasSendableContent) ?? false);
    if (!hasAttachments && !hasContent && !hasRenderableEmbeds) {
      return `Nothing to send\nMessage ${i + 1}: add text, attach a file, or fill in an embed.`;
    }
  }
  return null;
}

export function buildPayload(msg: Message): DiscordWebhookPayload {
  const payload: DiscordWebhookPayload = {};

  if (isComponentsV2(msg)) {
    if (msg.username) payload.username = msg.username;
    if (msg.avatar_url) payload.avatar_url = msg.avatar_url;
    if (msg.tts) payload.tts = true;
    payload.flags = (msg.flags & ~4) | COMPONENTS_V2_FLAG;
    if (msg.thread_name) payload.thread_name = msg.thread_name;
    payload.components = buildComponentBlocks(msg.componentBlocks ?? []);
    return normalizeDiscordMediaPayload(payload);
  }
  if (msg.linkButtons?.length) payload.components = buildLinkRows(msg.linkButtons);

  if (msg.content) payload.content = expandDiscordInputEscapes(msg.content);
  if (msg.username) payload.username = msg.username;
  if (msg.avatar_url) payload.avatar_url = msg.avatar_url;
  if (msg.tts) payload.tts = true;
  if (msg.flags & ~COMPONENTS_V2_FLAG) payload.flags = msg.flags & ~COMPONENTS_V2_FLAG;
  if (msg.thread_name) payload.thread_name = msg.thread_name;

  if (msg.embeds && msg.embeds.length > 0) {
    payload.embeds = msg.embeds.map((embed) => {
      const e: DiscordEmbedPayload = {};
      if (embed.title) e.title = expandDiscordInputEscapes(embed.title);
      if (embed.url) e.url = embed.url;
      if (embed.description) e.description = expandDiscordInputEscapes(embed.description);
      if (embed.colorExplicit !== false && embed.color !== undefined && embed.color !== null) e.color = embed.color;
      if (embed.timestamp) e.timestamp = embed.timestamp;

      if (embed.author?.name) {
        const author: DiscordEmbedAuthorPayload = { name: expandDiscordInputEscapes(embed.author.name) };
        if (embed.author.url) author.url = embed.author.url;
        if (embed.author.icon_url) author.icon_url = embed.author.icon_url;
        e.author = author;
      }
      if (embed.thumbnail?.url) e.thumbnail = { url: embed.thumbnail.url };
      if (embed.image?.url) e.image = { url: embed.image.url };
      if (embed.footer?.text) {
        const footer: DiscordEmbedFooterPayload = { text: expandDiscordInputEscapes(embed.footer.text) };
        if (embed.footer.icon_url) footer.icon_url = embed.footer.icon_url;
        e.footer = footer;
      }

      if (embed.fields && embed.fields.length > 0) {
        e.fields = embed.fields
          .filter((f) => (f.name ?? '').trim() && (f.value ?? '').trim())
          .map((f) => ({
            name: normalizeDiscordEmbedFieldText(f.name),
            value: normalizeDiscordEmbedFieldText(f.value),
            inline: f.inline || undefined,
          }));
        if (e.fields!.length === 0) delete e.fields;
      }

      return e;
    });
  }

  return normalizeDiscordMediaPayload(payload);
}
