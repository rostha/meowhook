import { activeMessageAttachments } from './componentAttachments';
import type { Message, Embed, FileAttachment } from './types';

/**
 * Discord Attachment Tracker
 *
 * Discord's 10 attachment limit applies to:
 * 1. Content attachments (files uploaded to the message)
 * 2. Embed images (image.url, thumbnail.url)
 * 3. Author icons, footer icons
 *
 * This utility tracks total attachment usage per message
 */

export const DISCORD_ATTACHMENT_LIMIT = 10;

export interface AttachmentUsage {
  contentFiles: number;        // Files attached to message content
  embedImages: number;         // Main embed images
  embedThumbnails: number;     // Embed thumbnails
  authorIcons: number;         // Author icons
  footerIcons: number;         // Footer icons
  total: number;
  hasReachedLimit: boolean;
  remainingSlots: number;
}

/**
 * Check if a URL is a blob (local file that counts toward limit)
 */
function isBlobUrl(url: string): boolean {
  return url?.startsWith('blob:') ?? false;
}

/**
 * Calculate attachment usage for a single embed
 */
function calculateEmbedAttachments(embed: Embed): {
  images: number;
  thumbnails: number;
  authorIcons: number;
  footerIcons: number;
} {
  return {
    images: isBlobUrl(embed.image?.url) ? 1 : 0,
    thumbnails: isBlobUrl(embed.thumbnail?.url) ? 1 : 0,
    authorIcons: isBlobUrl(embed.author?.icon_url) ? 1 : 0,
    footerIcons: isBlobUrl(embed.footer?.icon_url) ? 1 : 0,
  };
}

/**
 * Calculate total attachment usage for a message
 */
export function calculateAttachmentUsage(message: Message): AttachmentUsage {
  if (message.componentMode === 'v2' || message.flags & 32768) {
    const total = activeMessageAttachments(message).length;
    return { contentFiles: total, embedImages: 0, embedThumbnails: 0, authorIcons: 0, footerIcons: 0, total, hasReachedLimit: total >= DISCORD_ATTACHMENT_LIMIT, remainingSlots: Math.max(0, DISCORD_ATTACHMENT_LIMIT - total) };
  }
  // Content files (attachments to the message itself)
  const contentAttachments = message._attachments || [];
  const contentFiles = contentAttachments.filter(a => a.fieldKey.startsWith('content_file')).length;
  const avatarFile = contentAttachments.find(a => a.fieldKey === 'avatar');

  // Avatar doesn't count toward the 10 limit in the same way, but we track it
  // Discord handles avatar separately from message attachments

  // Count embed attachments
  let embedImages = 0;
  let embedThumbnails = 0;
  let authorIcons = 0;
  let footerIcons = 0;

  for (const embed of message.embeds) {
    const counts = calculateEmbedAttachments(embed);
    embedImages += counts.images;
    embedThumbnails += counts.thumbnails;
    authorIcons += counts.authorIcons;
    footerIcons += counts.footerIcons;
  }

  const total = contentFiles + embedImages + embedThumbnails + authorIcons + footerIcons;

  return {
    contentFiles,
    embedImages,
    embedThumbnails,
    authorIcons,
    footerIcons,
    total,
    hasReachedLimit: total >= DISCORD_ATTACHMENT_LIMIT,
    remainingSlots: Math.max(0, DISCORD_ATTACHMENT_LIMIT - total),
  };
}

/**
 * Get a human-readable summary of attachment usage
 */
export function getAttachmentUsageSummary(usage: AttachmentUsage): string {
  const parts: string[] = [];
  if (usage.contentFiles > 0) parts.push(`${usage.contentFiles} file${usage.contentFiles > 1 ? 's' : ''}`);
  if (usage.embedImages > 0) parts.push(`${usage.embedImages} embed image${usage.embedImages > 1 ? 's' : ''}`);
  if (usage.embedThumbnails > 0) parts.push(`${usage.embedThumbnails} thumbnail${usage.embedThumbnails > 1 ? 's' : ''}`);
  if (usage.authorIcons > 0) parts.push(`${usage.authorIcons} author icon${usage.authorIcons > 1 ? 's' : ''}`);
  if (usage.footerIcons > 0) parts.push(`${usage.footerIcons} footer icon${usage.footerIcons > 1 ? 's' : ''}`);

  if (parts.length === 0) return 'No attachments';
  return parts.join(', ');
}

/**
 * Check if a specific embed field can accept a new file
 */
export function canAddEmbedFile(message: Message, fieldType: 'image' | 'thumbnail' | 'author' | 'footer'): boolean {
  const usage = calculateAttachmentUsage(message);
  if (!usage.hasReachedLimit) return true;

  // If at limit, check if this specific field already has a file (can replace)
  // This allows replacing existing files even at the limit
  const embed = message.embeds[message.embeds.length - 1]; // Check last embed
  if (!embed) return false;

  switch (fieldType) {
    case 'image':
      return isBlobUrl(embed.image?.url);
    case 'thumbnail':
      return isBlobUrl(embed.thumbnail?.url);
    case 'author':
      return isBlobUrl(embed.author?.icon_url);
    case 'footer':
      return isBlobUrl(embed.footer?.icon_url);
    default:
      return false;
  }
}

/**
 * Calculate total attachments across multiple messages
 */
export function calculateTotalAttachments(messages: Message[]): number {
  return messages.reduce((total, msg) => total + calculateAttachmentUsage(msg).total, 0);
}

/**
 * Sequence sends no longer need cross-message attachment batching.
 * Discord's 10-upload limit applies per message, and per-message attachment
 * batching is handled deeper in the webhook sender.
 */
export function groupMessagesIntoBatches(messages: Message[]): Message[][] {
  return messages.length > 0 ? [messages] : [];
}

/**
 * Get tooltip text for disabled upload button
 */
export function getUploadDisabledTooltip(usage: AttachmentUsage, fieldName: string): string {
  if (usage.hasReachedLimit) {
    return `At ${DISCORD_ATTACHMENT_LIMIT} attachment limit (${usage.total} used). Remove files to add ${fieldName}.`;
  }
  return `${usage.remainingSlots} slot${usage.remainingSlots === 1 ? '' : 's'} remaining`;
}
