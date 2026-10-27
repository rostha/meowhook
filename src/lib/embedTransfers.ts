import { componentMediaUrls, findComponentAttachment } from './componentAttachments';
import { calculateAttachmentUsage, DISCORD_ATTACHMENT_LIMIT } from './attachmentTracker';
import type { Embed, FileAttachment, Message } from './types';

export const EMBED_ATTACHMENT_FIELDS = ['image', 'thumbnail', 'author_icon', 'footer_icon'] as const;

export type EmbedAttachmentField = (typeof EMBED_ATTACHMENT_FIELDS)[number];

function isBlobUrl(url: string | undefined): url is string {
  return typeof url === 'string' && (url.startsWith('blob:') || url.startsWith('local-file:'));
}

export function buildEmbedAttachmentFieldKey(embedId: string, field: EmbedAttachmentField): string {
  return `embed.${embedId}.${field}`;
}

export function getEmbedAttachmentUrl(embed: Embed, field: EmbedAttachmentField): string {
  switch (field) {
    case 'image':
      return embed.image?.url || '';
    case 'thumbnail':
      return embed.thumbnail?.url || '';
    case 'author_icon':
      return embed.author?.icon_url || '';
    case 'footer_icon':
      return embed.footer?.icon_url || '';
  }
}

export function setEmbedAttachmentUrl(embed: Embed, field: EmbedAttachmentField, url: string): Embed {
  switch (field) {
    case 'image':
      return { ...embed, image: { url } };
    case 'thumbnail':
      return { ...embed, thumbnail: { url } };
    case 'author_icon':
      return { ...embed, author: { ...embed.author, icon_url: url } };
    case 'footer_icon':
      return { ...embed, footer: { ...embed.footer, icon_url: url } };
  }
}

export function getEmbedBlobPreviewUrls(embed: Embed): string[] {
  const urls = new Set<string>();
  for (const field of EMBED_ATTACHMENT_FIELDS) {
    const url = getEmbedAttachmentUrl(embed, field);
    if (isBlobUrl(url)) {
      urls.add(url);
    }
  }
  return [...urls];
}

function getMessageEmbedBlobPreviewUrls(message: Message): Set<string> {
  const urls = new Set<string>();
  for (const embed of message.embeds) {
    for (const url of getEmbedBlobPreviewUrls(embed)) {
      urls.add(url);
    }
  }
  return urls;
}

function mergeBlobAttachments(
  existingAttachments: FileAttachment[] | undefined,
  incomingAttachments: FileAttachment[]
): FileAttachment[] | undefined {
  if ((!existingAttachments || existingAttachments.length === 0) && incomingAttachments.length === 0) {
    return undefined;
  }

  const nextAttachments = [...(existingAttachments || [])];
  const seenBlobPreviewUrls = new Set(
    nextAttachments
      .filter((attachment) => isBlobUrl(attachment.previewUrl))
      .map((attachment) => attachment.previewUrl)
  );

  for (const attachment of incomingAttachments) {
    if (isBlobUrl(attachment.previewUrl) && seenBlobPreviewUrls.has(attachment.previewUrl)) {
      continue;
    }
    nextAttachments.push(attachment);
    if (isBlobUrl(attachment.previewUrl)) {
      seenBlobPreviewUrls.add(attachment.previewUrl);
    }
  }

  return nextAttachments.length > 0 ? nextAttachments : undefined;
}

export function pruneUnusedMessageAttachments(message: Message): Message {
  const attachments = message._attachments || [];
  if (attachments.length === 0) return message;

  const referencedEmbedBlobUrls = getMessageEmbedBlobPreviewUrls(message);
  // Both section accessories stay editable in the draft; only the active one is sent.
  const componentUrls = componentMediaUrls(message.componentBlocks ?? [], true);
  const seenEmbedBlobUrls = new Set<string>();
  const activeAvatarPreviewUrl = message.avatar_url || null;
  const nextAttachments = attachments.filter((attachment) => {
    if (attachment.fieldKey === 'avatar') {
      return activeAvatarPreviewUrl === attachment.previewUrl;
    }
    if (componentUrls.some(url => findComponentAttachment(url, [attachment]))) return true;
    if (attachment.fieldKey.startsWith('content_file')) {
      return true;
    }
    if (!referencedEmbedBlobUrls.has(attachment.previewUrl)) {
      return false;
    }
    if (seenEmbedBlobUrls.has(attachment.previewUrl)) {
      return false;
    }
    seenEmbedBlobUrls.add(attachment.previewUrl);
    return true;
  });

  if (
    nextAttachments.length === attachments.length &&
    nextAttachments.every((attachment, index) => attachment === attachments[index])
  ) {
    return message;
  }

  return {
    ...message,
    _attachments: nextAttachments.length > 0 ? nextAttachments : undefined,
  };
}

export function getEmbedMoveBlockingReason(
  messages: Message[],
  sourceMessageIndex: number,
  targetMessageIndex: number,
  embedId: string
): string | null {
  const sourceMessage = messages[sourceMessageIndex];
  const targetMessage = messages[targetMessageIndex];

  if (!sourceMessage || !targetMessage) return 'Could not find that message.';
  if (sourceMessageIndex === targetMessageIndex) return 'This embed is already in that message.';

  const embed = sourceMessage.embeds.find((entry) => entry.id === embedId);
  if (!embed) return 'Could not find that embed.';

  if (targetMessage.embeds.length >= 10) {
    return `Message ${targetMessageIndex + 1} already has 10 embeds.`;
  }

  const currentTargetUsage = calculateAttachmentUsage(targetMessage).total;
  const movedTargetUsage = calculateAttachmentUsage({
    ...targetMessage,
    embeds: [...targetMessage.embeds, embed],
  }).total;

  if (
    movedTargetUsage > DISCORD_ATTACHMENT_LIMIT &&
    movedTargetUsage > currentTargetUsage
  ) {
    return `Moving this embed would take Message ${targetMessageIndex + 1} to ${movedTargetUsage}/${DISCORD_ATTACHMENT_LIMIT} uploaded attachments.`;
  }

  return null;
}

export function moveEmbedBetweenMessages(
  messages: Message[],
  sourceMessageIndex: number,
  targetMessageIndex: number,
  embedId: string
): { messages: Message[]; movedEmbed?: Embed; error?: string } {
  const error = getEmbedMoveBlockingReason(messages, sourceMessageIndex, targetMessageIndex, embedId);
  if (error) {
    return { messages, error };
  }

  const sourceMessage = messages[sourceMessageIndex];
  const targetMessage = messages[targetMessageIndex];
  const sourceEmbedIndex = sourceMessage.embeds.findIndex((entry) => entry.id === embedId);
  const movedEmbed = sourceMessage.embeds[sourceEmbedIndex];

  if (!movedEmbed) {
    return { messages, error: 'Could not find that embed.' };
  }

  const movedBlobPreviewUrls = new Set(getEmbedBlobPreviewUrls(movedEmbed));
  const attachmentsToMove = (sourceMessage._attachments || []).filter((attachment) =>
    movedBlobPreviewUrls.has(attachment.previewUrl)
  );

  const nextSourceMessage = pruneUnusedMessageAttachments({
    ...sourceMessage,
    embeds: sourceMessage.embeds.filter((_, index) => index !== sourceEmbedIndex),
  });

  const nextTargetMessage = pruneUnusedMessageAttachments({
    ...targetMessage,
    embeds: [...targetMessage.embeds, movedEmbed],
    _attachments: mergeBlobAttachments(targetMessage._attachments, attachmentsToMove),
  });

  const nextMessages = [...messages];
  nextMessages[sourceMessageIndex] = nextSourceMessage;
  nextMessages[targetMessageIndex] = nextTargetMessage;

  return {
    messages: nextMessages,
    movedEmbed,
  };
}
