import type { ComponentBlock, DiscordComponentPayload, LinkButton, Message, FileAttachment, DiscordLinkButtonPayload } from './types';
import { uid } from './utils';
import { expandDiscordInputEscapes } from './markdown';
import { componentAttachmentUrl, findComponentAttachment } from './componentAttachments';

export const COMPONENTS_V2_FLAG = 1 << 15;
export const DEFAULT_CONTAINER_ACCENT = 0xa9b9b4;
export const isComponentsV2 = (message: { componentMode?: string; flags: number }) => message.componentMode === 'v2' || (message.flags & COMPONENTS_V2_FLAG) !== 0;

/** Empty editor blocks are draft scaffolding, not message text to invent in the preview. */
export function hasComponentPreviewContent(blocks: ComponentBlock[]): boolean {
  return blocks.some(block => {
    switch (block.type) {
      case 'text': return !!block.content.trim();
      case 'section': return sectionTexts(block).some(text => !!text.trim()) || (block.accessory === 'link'
        ? !!(block.button?.label.trim() || block.button?.emoji?.trim() || block.button?.url.trim())
        : !!block.url.trim());
      case 'gallery': return block.items.some(item => !!item.url.trim());
      case 'file': return !!block.url.trim();
      case 'container': return hasComponentPreviewContent(block.blocks);
      case 'links': return block.buttons.some(button => !!(button.label.trim() || button.emoji?.trim() || button.url.trim()));
      case 'separator': return true;
    }
  });
}

export function validComponentUrl(value: string): boolean {
  try { const url = new URL(value); return (url.protocol === 'https:' || url.protocol === 'http:') && !!url.hostname; }
  catch { return false; }
}

export const newTextBlock = (): ComponentBlock => ({ id: uid(), type: 'text', content: '' });
export const newLinksBlock = (): ComponentBlock => ({ id: uid(), type: 'links', buttons: [{ id: uid(), label: '', url: '' }] });
export const newBlock = (type: ComponentBlock['type']): ComponentBlock => {
  switch (type) {
    case 'text': return newTextBlock();
    case 'section': return { id: uid(), type, content: '', url: '', description: '' };
    case 'gallery': return { id: uid(), type, items: [{ id: uid(), url: '', description: '' }] };
    case 'file': return { id: uid(), type, url: '' };
    case 'separator': return { id: uid(), type, divider: true, spacing: 1 };
    case 'container': return { id: uid(), type, color: DEFAULT_CONTAINER_ACCENT, blocks: [newTextBlock()] };
    case 'links': return newLinksBlock();
  }
};

/** Start a V2 layout from the content people already wrote in the regular editor. */
export function regularMessageToV2Blocks(message: Message): ComponentBlock[] {
  const blocks: ComponentBlock[] = [];
  if (message.content.trim()) blocks.push({ id: uid(), type: 'text', content: message.content });
  for (const embed of message.embeds) {
    const title = embed.title.trim();
    const parts = [
      embed.author.name.trim() ? `*${embed.author.name.trim()}*` : '',
      title ? embed.url.trim() ? `**[${title}](${embed.url.trim()})**` : `**${title}**` : '',
      embed.description.trim(),
      ...embed.fields.filter(field => field.name.trim() && field.value.trim()).map(field => `**${field.name.trim()}**\n${field.value.trim()}`),
      embed.footer.text.trim(),
    ].filter(Boolean);
    const text = parts.join('\n\n');
    const inner: ComponentBlock[] = [];
    if (embed.thumbnail.url.trim() && text && text.length <= 4000) {
      inner.push({ id: uid(), type: 'section', content: text, url: embed.thumbnail.url.trim(), description: title });
    } else {
      if (text) inner.push({ id: uid(), type: 'text', content: text });
      if (embed.thumbnail.url.trim()) inner.push({ id: uid(), type: 'gallery', items: [{ id: uid(), url: embed.thumbnail.url.trim(), description: title }] });
    }
    if (embed.image.url.trim()) inner.push({ id: uid(), type: 'gallery', items: [{ id: uid(), url: embed.image.url.trim(), description: title }] });
    if (inner.length) blocks.push({ id: uid(), type: 'container', color: embed.color, colorExplicit: embed.colorExplicit, blocks: inner });
  }
  for (const attachment of message._attachments ?? []) {
    if (attachment.fieldKey.startsWith('content_file')) blocks.push({ id: uid(), type: 'file', url: componentAttachmentUrl(attachment) });
  }
  if (message.linkButtons?.length) blocks.push({ id: uid(), type: 'links', buttons: message.linkButtons.map(button => ({ ...button, id: uid() })) });
  return blocks.length ? blocks : [newTextBlock()];
}

export function retainV2ModeWhenLoading(loaded: Message, current: Message): Message {
  if (!isComponentsV2(current) || isComponentsV2(loaded)) return loaded;
  return {
    ...loaded,
    componentMode: 'v2',
    flags: (loaded.flags & ~4) | COMPONENTS_V2_FLAG,
    componentBlocks: regularMessageToV2Blocks(loaded),
  };
}

export function buttonEmoji(value: string | undefined): DiscordLinkButtonPayload['emoji'] | undefined {
  const emoji = value?.trim();
  if (!emoji) return undefined;
  const custom = emoji.match(/^<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/);
  if (custom) return { name: custom[2], id: custom[3], ...(custom[1] ? { animated: true } : {}) };
  return { name: emoji };
}

export function buildLinkButton(button: LinkButton): DiscordLinkButtonPayload {
  return { type: 2, style: 5, ...(button.label.trim() ? { label: button.label.trim() } : {}), url: button.url.trim(),
    ...(button.emoji?.trim() ? { emoji: buttonEmoji(button.emoji) } : {}), ...(button.disabled ? { disabled: true } : {}) };
}

export function buildLinkRows(buttons: LinkButton[]): DiscordComponentPayload[] {
  const rows: DiscordComponentPayload[] = [];
  for (let i = 0; i < buttons.length; i += 5) rows.push({ type: 1, components: buttons.slice(i, i + 5).map(buildLinkButton) });
  return rows;
}

export const sectionTexts = (block: Extract<ComponentBlock, { type: 'section' }>) => [block.content, ...(block.texts ?? []).map(text => text.content)];
export function componentBudget(blocks: ComponentBlock[]): { count: number; text: number } {
  return blocks.reduce((total, block) => {
    total.count += 1;
    if (block.type === 'container') { const inner = componentBudget(block.blocks); total.count += inner.count; total.text += inner.text; }
    if (block.type === 'links') total.count += block.buttons.length;
    if (block.type === 'section') { total.count += sectionTexts(block).length + 1; total.text += sectionTexts(block).reduce((sum, content) => sum + expandDiscordInputEscapes(content).length, 0); }
    if (block.type === 'text') total.text += expandDiscordInputEscapes(block.content).length;
    return total;
  }, { count: 0, text: 0 });
}

export function buildComponentBlocks(blocks: ComponentBlock[]): DiscordComponentPayload[] {
  return blocks.flatMap((block): DiscordComponentPayload[] => {
    switch (block.type) {
      case 'text': return [{ type: 10, content: expandDiscordInputEscapes(block.content) }];
      case 'section': return [{ type: 9, components: sectionTexts(block).map(content => ({ type: 10, content: expandDiscordInputEscapes(content) })), accessory: block.accessory === 'link'
        ? buildLinkButton(block.button ?? { id: '', label: '', url: '' })
        : { type: 11, media: { url: block.url.trim() }, ...(block.description.trim() ? { description: block.description.trim() } : {}), ...(block.spoiler ? { spoiler: true } : {}) } }];
      case 'gallery': return [{ type: 12, items: block.items.map(item => ({ media: { url: item.url.trim() }, ...(item.description.trim() ? { description: item.description.trim() } : {}), ...(item.spoiler ? { spoiler: true } : {}) })) }];
      case 'file': return [{ type: 13, file: { url: block.url.trim() }, ...(block.spoiler ? { spoiler: true } : {}) }];
      case 'separator': return [{ type: 14, divider: block.divider, spacing: block.spacing }];
      case 'container': return [{ type: 17, ...(block.colorExplicit === false ? {} : { accent_color: block.color }), ...(block.spoiler ? { spoiler: true } : {}), components: buildComponentBlocks(block.blocks) }];
      case 'links': return buildLinkRows(block.buttons);
    }
  });
}

export function validateLinkButtons(buttons: LinkButton[], location: string): string | null {
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    if ((!button.label.trim() && !button.emoji?.trim()) || button.label.length > 80) return `${location}: link button ${i + 1} needs a label of up to 80 characters, or an emoji.`;
    if (!validComponentUrl(button.url) || button.url.length > 512) return `${location}: link button ${i + 1} needs a valid HTTP or HTTPS URL of up to 512 characters.`;
    if (button.emoji?.trim()) {
      const value = button.emoji.trim();
      const custom = buttonEmoji(value)?.id;
      const singleEmoji = value.length <= 32 && [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].length === 1 && /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(value);
      if (!custom && !singleEmoji) return `${location}: link button ${i + 1} needs one emoji or a Discord custom emoji such as <:name:123456789012345678>.`;
    }
  }
  return null;
}

export function validateComponentBlocks(blocks: ComponentBlock[], location: string, insideContainer = false, attachments: FileAttachment[] = []): string | null {
  if (!blocks.length) return `${location}: add a component before sending.`;
  const mediaIssue = (url: string, fileOnly = false): boolean => {
    if (!fileOnly && validComponentUrl(url)) return false;
    const attachment = findComponentAttachment(url.trim(), attachments);
    return !attachment || !(attachment.file || attachment.discordId || attachment.platformMediaId) || (fileOnly && !/^(blob:|attachment:\/\/)/.test(url) && !(attachment.platformMediaId && attachment.previewUrl === url));
  };
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const where = `${location}, block ${i + 1}`;
    switch (block.type) {
      case 'text': if (!block.content.trim()) return `${where}: add text.`; if (expandDiscordInputEscapes(block.content).length > 4000) return `${where}: text must be 4,000 characters or less.`; break;
      case 'section':
        if (sectionTexts(block).length > 3 || sectionTexts(block).some(content => !content.trim() || expandDiscordInputEscapes(content).length > 4000)) return `${where}: add up to 4,000 characters of text in each of 1–3 text blocks.`;
        if (block.accessory === 'link') { const issue = validateLinkButtons([block.button ?? { id: '', label: '', url: '' }], where); if (issue) return issue; }
        else {
          if (mediaIssue(block.url)) return `${where}: add a valid thumbnail image URL or upload an image.`;
          if (block.description.length > 1024) return `${where}: image description must be 1,024 characters or less.`;
        }
        break;
      case 'gallery':
        if (!block.items.length || block.items.length > 10) return `${where}: add 1–10 images or videos.`;
        for (let j = 0; j < block.items.length; j++) {
          if (mediaIssue(block.items[j].url)) return `${where}: image ${j + 1} needs a valid URL or uploaded file.`;
          if (block.items[j].description.length > 1024) return `${where}: image ${j + 1} description must be 1,024 characters or less.`;
        }
        break;
      case 'file': if (mediaIssue(block.url, true)) return `${where}: upload or select an attached file. File blocks cannot use a website URL.`; break;
      case 'separator': if (![1, 2].includes(block.spacing) || typeof block.divider !== 'boolean') return `${where}: choose Small or Large spacing.`; break;
      case 'links': { if (!block.buttons.length || block.buttons.length > 5) return `${where}: use 1–5 link buttons.`; const issue = validateLinkButtons(block.buttons, where); if (issue) return issue; break; }
      case 'container':
        if (insideContainer) return `${where}: containers cannot be nested.`;
        if (block.colorExplicit !== false && (!Number.isInteger(block.color) || block.color < 0 || block.color > 0xffffff)) return `${where}: choose a valid accent color.`;
        { const issue = validateComponentBlocks(block.blocks, where, true, attachments); if (issue) return issue; }
        break;
    }
  }
  const budget = componentBudget(blocks);
  if (budget.count > 40) return `${location}: Discord allows at most 40 components per message.`;
  if (budget.text > 4000) return `${location}: all V2 text together must fit within 4,000 characters.`;
  return null;
}

export function normalizeLinkButtons(value: unknown): LinkButton[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 25).filter(item => item && typeof item === 'object').map(item => {
    const button = item as Record<string, unknown>;
    return { id: typeof button.id === 'string' ? button.id : uid(), label: typeof button.label === 'string' ? button.label : '', url: typeof button.url === 'string' ? button.url : '',
      ...(typeof button.emoji === 'string' ? { emoji: button.emoji } : {}), ...(button.disabled === true ? { disabled: true } : {}) };
  });
}

export function normalizeComponentBlocks(value: unknown, depth = 0): ComponentBlock[] {
  if (!Array.isArray(value) || depth > 1) return [];
  return value.slice(0, 40).flatMap((raw): ComponentBlock[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id : uid();
    const str = (key: string) => typeof item[key] === 'string' ? item[key] as string : '';
    const spoiler = item.spoiler === true ? { spoiler: true } : {};
    switch (item.type) {
      case 'text': return [{ id, type: 'text', content: str('content') }];
      case 'section': return [{ id, type: 'section', content: str('content'), url: str('url'), description: str('description'), ...spoiler,
        ...(item.accessory === 'link' ? { accessory: 'link' as const } : {}),
        ...(item.button && typeof item.button === 'object' ? { button: normalizeLinkButtons([item.button])[0] } : {}),
        ...(Array.isArray(item.texts) ? { texts: item.texts.slice(0, 2).filter(text => text && typeof text === 'object').map(text => ({ id: typeof text.id === 'string' ? text.id : uid(), content: typeof text.content === 'string' ? text.content : '' })) } : {}) }];
      case 'gallery': return [{ id, type: 'gallery', items: Array.isArray(item.items) ? item.items.slice(0, 10).map(rawImage => {
        const image = rawImage && typeof rawImage === 'object' ? rawImage as Record<string, unknown> : {};
        return { id: typeof image.id === 'string' ? image.id : uid(), url: typeof image.url === 'string' ? image.url : '', description: typeof image.description === 'string' ? image.description : '', ...(image.spoiler === true ? { spoiler: true } : {}), ...(typeof image.mimeType === 'string' ? { mimeType: image.mimeType } : {}) };
      }) : [] }];
      case 'file': return [{ id, type: 'file', url: str('url'), ...spoiler }];
      case 'separator': return [{ id, type: 'separator', divider: item.divider !== false, spacing: item.spacing === 2 ? 2 : 1 }];
      case 'container': return depth === 0 ? [{ id, type: 'container', color: typeof item.color === 'number' ? item.color : DEFAULT_CONTAINER_ACCENT, ...(item.colorExplicit === false ? { colorExplicit: false } : {}), ...spoiler, blocks: normalizeComponentBlocks(item.blocks, depth + 1) }] : [];
      case 'links': return [{ id, type: 'links', buttons: normalizeLinkButtons(item.buttons) }];
      default: return [];
    }
  });
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
function linkFromDiscord(raw: unknown): LinkButton {
  const button = record(raw), emoji = record(button.emoji);
  return { id: uid(), label: typeof button.label === 'string' ? button.label : '', url: typeof button.url === 'string' ? button.url : '',
    ...(typeof emoji.id === 'string' ? { emoji: `<${emoji.animated ? 'a' : ''}:${emoji.name || 'emoji'}:${emoji.id}>` } : typeof emoji.name === 'string' ? { emoji: emoji.name } : {}), ...(button.disabled === true ? { disabled: true } : {}) };
}
export function blocksFromDiscord(value: unknown, attachments: unknown = [], depth = 0): ComponentBlock[] {
  if (!Array.isArray(value) || depth > 1) return [];
  const files = Array.isArray(attachments) ? attachments.map(record) : [];
  const mediaUrl = (raw: unknown, fileOnly = false) => {
    const media = record(raw);
    const url = typeof media.url === 'string' ? media.url : '';
    const attached = files.find(file => (media.attachment_id && file.id === media.attachment_id) || file.url === url || file.proxy_url === url || (url.startsWith('attachment://') && file.filename === url.slice(13)));
    if (attached && typeof attached.filename === 'string') return `attachment://${attached.filename}`;
    if (fileOnly && url && !url.startsWith('attachment://')) { try { return 'attachment://' + decodeURIComponent(new URL(url).pathname.split('/').pop()!); } catch { return ''; } }
    return url;
  };
  return value.flatMap((raw): ComponentBlock[] => {
    const c = record(raw);
    const spoiler = c.spoiler === true ? { spoiler: true } : {};
    const str = (key: string) => typeof c[key] === 'string' ? c[key] as string : '';
    switch (c.type) {
      case 10: return [{ id: uid(), type: 'text', content: str('content') }];
      case 9: {
        const accessory = record(c.accessory); const children = Array.isArray(c.components) ? c.components.map(record) : [];
        if (accessory.type !== 11 && !(accessory.type === 2 && accessory.style === 5)) return [];
        return [{ id: uid(), type: 'section', content: typeof children[0]?.content === 'string' ? children[0].content : '',
          ...(children.length > 1 ? { texts: children.slice(1).map(child => ({ id: uid(), content: typeof child.content === 'string' ? child.content : '' })) } : {}),
          url: mediaUrl(accessory.media), description: typeof accessory.description === 'string' ? accessory.description : '',
          ...(accessory.type === 2 ? { accessory: 'link' as const, button: linkFromDiscord(accessory) } : {}), ...(accessory.spoiler === true ? { spoiler: true } : {}) }];
      }
      case 12: return [{ id: uid(), type: 'gallery', items: Array.isArray(c.items) ? c.items.map(raw => { const image = record(raw); const media = record(image.media); return { id: uid(), url: mediaUrl(image.media), description: typeof image.description === 'string' ? image.description : '', ...(image.spoiler === true ? { spoiler: true } : {}), ...(typeof media.content_type === 'string' ? { mimeType: media.content_type } : {}) }; }) : [] }];
      case 13: return [{ id: uid(), type: 'file', url: mediaUrl(c.file, true), ...spoiler }];
      case 14: return [{ id: uid(), type: 'separator', divider: c.divider !== false, spacing: c.spacing === 2 ? 2 : 1 }];
      case 17: return depth === 0 ? [{ id: uid(), type: 'container', color: typeof c.accent_color === 'number' ? c.accent_color : DEFAULT_CONTAINER_ACCENT, ...(typeof c.accent_color !== 'number' ? { colorExplicit: false } : {}), ...spoiler, blocks: blocksFromDiscord(c.components, attachments, depth + 1) }] : [];
      case 1: { const buttons = Array.isArray(c.components) ? c.components.filter(x => record(x).style === 5).map(linkFromDiscord) : []; return buttons.length ? [{ id: uid(), type: 'links', buttons }] : []; }
      default: return [];
    }
  });
}

export function hasUnsupportedDiscordComponents(value: unknown, depth = 0): boolean {
  if (!Array.isArray(value)) return false;
  return value.some(raw => {
    const item = record(raw);
    switch (item.type) {
      case 10: case 12: case 13: case 14: return false;
      case 9: { const accessory = record(item.accessory); return !Array.isArray(item.components) || item.components.some(child => record(child).type !== 10) || !(accessory.type === 11 || (accessory.type === 2 && accessory.style === 5)); }
      case 17: return depth > 0 || !Array.isArray(item.components) || hasUnsupportedDiscordComponents(item.components, depth + 1);
      case 1: return !Array.isArray(item.components) || item.components.some(button => record(button).type !== 2 || record(button).style !== 5);
      default: return true;
    }
  });
}
