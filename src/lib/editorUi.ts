import { calculateAttachmentUsage } from './attachmentTracker';
import type { Message } from './types';

export type SummaryTone = 'muted' | 'accent' | 'warn' | 'danger';

export interface SectionSummary {
  text: string;
  tone?: SummaryTone;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function countEmbedFields(message: Message): number {
  return message.embeds.reduce((total, embed) => total + embed.fields.length, 0);
}

export function countPartialEmbedFields(message: Message): number {
  return message.embeds.reduce(
    (total, embed) =>
      total +
      embed.fields.filter(
        (field) => (!!field.name.trim() && !field.value.trim()) || (!field.name.trim() && !!field.value.trim()),
      ).length,
    0,
  );
}

export function getProfileSummary(message: Message): SectionSummary {
  const parts: string[] = [];
  if (message.username.trim()) parts.push('custom username');
  if (message.avatar_url.trim()) parts.push('avatar');

  if (parts.length === 0) {
    return { text: 'Uses webhook name and avatar' };
  }

  return { text: parts.join(' + '), tone: 'accent' };
}

export function getContentSummary(message: Message): SectionSummary {
  const contentLength = message.content.trim().length;
  if (contentLength === 0) {
    return { text: 'No text yet', tone: 'muted' };
  }

  return {
    text: `${pluralize(contentLength, 'char')}${contentLength > 1800 ? ' near Discord limit' : ''}`,
    tone: contentLength > 1800 ? 'warn' : 'muted',
  };
}

export function getFilesSummary(message: Message): SectionSummary {
  const usage = calculateAttachmentUsage(message);
  if (usage.total === 0) {
    return { text: 'No uploads yet' };
  }

  const parts = [
    `${pluralize(usage.total, 'upload')} used`,
    `${usage.remainingSlots} slot${usage.remainingSlots === 1 ? '' : 's'} left`,
  ];
  if (usage.contentFiles > 0) {
    parts.unshift(`${pluralize(usage.contentFiles, 'file')}`);
  }

  return {
    text: parts.join(' / '),
    tone: usage.hasReachedLimit ? 'warn' : 'accent',
  };
}

export function getEmbedsSummary(message: Message): SectionSummary {
  if (message.embeds.length === 0) {
    return { text: 'No embeds added', tone: 'muted' };
  }

  const fieldCount = countEmbedFields(message);
  const partialFieldCount = countPartialEmbedFields(message);
  const parts = [pluralize(message.embeds.length, 'embed')];
  if (fieldCount > 0) parts.push(pluralize(fieldCount, 'field'));
  if (partialFieldCount > 0) parts.push(`${pluralize(partialFieldCount, 'partial field')} to finish`);

  return {
    text: parts.join(' / '),
    tone: partialFieldCount > 0 ? 'warn' : 'accent',
  };
}

export function getAdvancedSummary(message: Message): SectionSummary {
  const flags: string[] = [];
  if ((message.flags & 4) !== 0) flags.push('embeds suppressed');
  if ((message.flags & 4096) !== 0) flags.push('silent');

  if (flags.length === 0) {
    return { text: 'Default settings' };
  }

  return { text: flags.join(' / '), tone: 'accent' };
}
