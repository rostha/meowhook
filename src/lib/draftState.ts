import { localFileId, replaceLocalUrls } from './localFiles';
import type { Embed, Field, FileAttachment, Message, Tab } from './types';

export interface DraftHistorySnapshot {
  tabs: Tab[];
  activeTabIndex: number;
}

function cloneAttachment(attachment: FileAttachment): FileAttachment {
  return { ...attachment };
}

function cloneField(field: Field): Field {
  return { ...field };
}

function cloneEmbed(embed: Embed): Embed {
  return {
    ...embed,
    fields: embed.fields.map(cloneField),
    author: { ...embed.author },
    thumbnail: { ...embed.thumbnail },
    image: { ...embed.image },
    footer: { ...embed.footer },
  };
}

function cloneMessage(message: Message): Message {
  return {
    ...message,
    embeds: message.embeds.map(cloneEmbed),
    linkButtons: message.linkButtons?.map(button => ({ ...button })),
    componentBlocks: message.componentBlocks ? structuredClone(message.componentBlocks) : undefined,
    _attachments: message._attachments?.map(cloneAttachment),
  };
}

export function cloneTabsForHistory(tabs: Tab[]): Tab[] {
  return tabs.map((tab) => ({
    ...tab,
    messages: tab.messages.map(cloneMessage),
  }));
}

export function cloneDraftHistorySnapshot(snapshot: DraftHistorySnapshot): DraftHistorySnapshot {
  return {
    activeTabIndex: snapshot.activeTabIndex,
    tabs: cloneTabsForHistory(snapshot.tabs),
  };
}

function isBlobUrl(url: string | undefined): boolean {
  return typeof url === 'string' && url.startsWith('blob:');
}

function stripBlobUrlsFromEmbed(embed: Embed): Embed {
  return {
    ...embed,
    image: { url: isBlobUrl(embed.image?.url) ? '' : embed.image?.url || '' },
    thumbnail: { url: isBlobUrl(embed.thumbnail?.url) ? '' : embed.thumbnail?.url || '' },
    author: {
      ...embed.author,
      icon_url: isBlobUrl(embed.author?.icon_url) ? '' : embed.author?.icon_url || '',
    },
    footer: {
      ...embed.footer,
      icon_url: isBlobUrl(embed.footer?.icon_url) ? '' : embed.footer?.icon_url || '',
    },
  };
}

export function stripTransientAttachmentsFromMessage(message: Message): Message {
  const urls = new Map<string, string>();
  const attachments = (message._attachments ?? []).map(attachment => {
    const local = attachment.file || attachment.fileId || isBlobUrl(attachment.previewUrl);
    const fileId = local ? localFileId(attachment) : undefined;
    const previewUrl = local ? 'local-file:' + fileId : attachment.previewUrl;
    if (local) urls.set(attachment.previewUrl, previewUrl);
    return {
      fieldKey: attachment.fieldKey, previewUrl, fileId, discordId: attachment.discordId,
      platformMediaId: attachment.platformMediaId,
      name: attachment.name ?? attachment.file?.name,
      size: attachment.size ?? attachment.file?.size,
      mimeType: attachment.mimeType ?? attachment.file?.type,
    };
  });
  const result = replaceLocalUrls({ ...message, _attachments: attachments.length ? attachments : undefined }, urls);
  // Also clear orphaned blob URLs with no file record.
  return { ...result, avatar_url: isBlobUrl(result.avatar_url) ? '' : result.avatar_url, embeds: result.embeds.map(stripBlobUrlsFromEmbed) };
}

export function stripTransientAttachmentsFromMessages(messages: Message[]): Message[] {
  return messages.map(stripTransientAttachmentsFromMessage);
}

export function stripTransientAttachmentsFromTabs(tabs: Tab[]): Tab[] {
  return tabs.map((tab) => ({
    ...tab,
    messages: stripTransientAttachmentsFromMessages(tab.messages),
  }));
}
