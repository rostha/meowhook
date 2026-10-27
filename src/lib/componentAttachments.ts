import type { ComponentBlock, DiscordComponentPayload, FileAttachment, Message } from './types';

export function componentMediaUrls(blocks: ComponentBlock[], includeDormant = false): string[] {
  return blocks.flatMap(block => block.type === 'container' ? componentMediaUrls(block.blocks, includeDormant)
    : block.type === 'gallery' ? block.items.map(item => item.url)
    : block.type === 'file' || (block.type === 'section' && (includeDormant || block.accessory !== 'link')) ? [block.url] : []);
}

export function componentAttachmentUrl(attachment: FileAttachment): string {
  if (attachment.platformMediaId) return attachment.previewUrl;
  if (attachment.discordId && attachment.name) return `attachment://${attachment.name}`;
  return attachment.file || attachment.previewUrl.startsWith('local-file:') || attachment.previewUrl.startsWith('blob:')
    ? attachment.previewUrl : `attachment://${attachment.name ?? ''}`;
}

export function findComponentAttachment(url: string, attachments: FileAttachment[]): FileAttachment | undefined {
  return attachments.find(attachment => attachment.previewUrl === url ||
    (url.startsWith('attachment://') && url.slice(13) === (attachment.name ?? attachment.file?.name)));
}

/** Keep dormant uploads in the draft; send only media used by the active format. */
export function activeMessageAttachments(message: Message): FileAttachment[] {
  if (message.componentMode !== 'v2' && !(message.flags & 32768)) {
    const embedUrls = message.embeds.flatMap(embed => [embed.image.url, embed.thumbnail.url, embed.author.icon_url, embed.footer.icon_url]);
    return (message._attachments ?? []).filter(attachment => !attachment.fieldKey.startsWith('component_file_')
      || embedUrls.some(url => findComponentAttachment(url, [attachment])));
  }
  const urls = componentMediaUrls(message.componentBlocks ?? []);
  const seen = new Set<string>();
  return (message._attachments ?? []).filter(attachment => {
    if (seen.has(attachment.previewUrl) || !urls.some(url => findComponentAttachment(url, [attachment]))) return false;
    seen.add(attachment.previewUrl);
    return true;
  });
}

export function componentPreviewUrl(url: string, attachments: FileAttachment[]): string {
  return url.startsWith('attachment://') ? findComponentAttachment(url, attachments)?.previewUrl ?? '' : url;
}

export function mapBlockMedia(blocks: ComponentBlock[], urls: Map<string, string>): ComponentBlock[] {
  return blocks.map(block => block.type === 'container' ? { ...block, blocks: mapBlockMedia(block.blocks, urls) }
    : block.type === 'gallery' ? { ...block, items: block.items.map(item => ({ ...item, url: urls.get(item.url) ?? item.url })) }
    : block.type === 'file' || (block.type === 'section' && block.accessory !== 'link') ? { ...block, url: urls.get(block.url) ?? block.url } : block);
}

/** Only rewrite media fields: matching text or link destinations must stay untouched. */
export function patchComponentMedia(components: DiscordComponentPayload[], urls: Map<string, string>): DiscordComponentPayload[] {
  return components.map(component => {
    if (component.type === 17) return { ...component, components: patchComponentMedia(component.components, urls) };
    if (component.type === 9 && component.accessory.type === 11) return { ...component, accessory: { ...component.accessory, media: { url: urls.get(component.accessory.media.url) ?? component.accessory.media.url } } };
    if (component.type === 12) return { ...component, items: component.items.map(item => ({ ...item, media: { url: urls.get(item.media.url) ?? item.media.url } })) };
    if (component.type === 13) return { ...component, file: { url: urls.get(component.file.url) ?? component.file.url } };
    return component;
  });
}
