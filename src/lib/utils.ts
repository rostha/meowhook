import { replaceLocalUrls } from './localFiles';
import { discordMessageAttachments } from './discordAttachments';
import type { Message, Embed, Field, Tab, FileAttachment, DiscordWebhookPayload } from './types';
import { normalizeLinkButtons, normalizeComponentBlocks, blocksFromDiscord, hasUnsupportedDiscordComponents, COMPONENTS_V2_FLAG, isComponentsV2 } from './messageComponents';
import { embedTextLength } from './editorLimits';
import {
  stripTransientAttachmentsFromMessage,
  stripTransientAttachmentsFromMessages,
  stripTransientAttachmentsFromTabs,
} from './draftState';

/** Rows for live preview: Discord lays out inline fields in groups of up to 3 per row; each row splits width only across that group. */
export type EmbedFieldPreviewRow =
  | { kind: 'full'; field: Field }
  | { kind: 'inline'; fields: Field[] };

export function groupEmbedFieldsForPreview(fields: Field[]): EmbedFieldPreviewRow[] {
  const rows: EmbedFieldPreviewRow[] = [];
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    if (!f.inline) {
      rows.push({ kind: 'full', field: f });
      i++;
      continue;
    }
    const group: Field[] = [];
    while (i < fields.length && fields[i].inline && group.length < 3) {
      group.push(fields[i]);
      i++;
    }
    rows.push({ kind: 'inline', fields: group });
  }
  return rows;
}

/** `grid-template-columns` for an inline row — matches Discord (2 fields = 50% each, not 33%). */
export function inlineEmbedFieldGridTemplateColumns(inlineCount: number): string {
  if (inlineCount <= 0) return '1fr';
  if (inlineCount === 1) return 'repeat(3, 1fr)';
  return `repeat(${inlineCount}, 1fr)`;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

const VALID_HOSTS = ['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com'];

// Debounce function generator
export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function isValidWebhookUrl(url: string): boolean {
  if (!url) return false;
  // If it's cached from a previous check, return fast
  if ((isValidWebhookUrl as any)._cacheUrl === url) {
    return (isValidWebhookUrl as any)._cacheResult;
  }
  
  try {
    const u = new URL(url);
    const valid = VALID_HOSTS.includes(u.hostname) && u.pathname.includes('/api/webhooks/');
    (isValidWebhookUrl as any)._cacheUrl = url;
    (isValidWebhookUrl as any)._cacheResult = valid;
    return valid;
  } catch {
    (isValidWebhookUrl as any)._cacheUrl = url;
    (isValidWebhookUrl as any)._cacheResult = false;
    return false;
  }
}

/** Parse a Discord message link or raw ID into a message ID.
 *  Supports:
 *  - Raw ID: "1234567890123456789"
 *  - Full link: "https://discord.com/channels/guild/channel/1234567890123456789"
 */
export function parseMessageIdOrLink(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Raw numeric ID
  if (/^\d{17,20}$/.test(trimmed)) return trimmed;

  // Discord message link
  const match = trimmed.match(/\/channels\/\d+\/\d+\/(\d{17,20})/);
  if (match) return match[1];

  return null;
}

export function createDefaultField(): Field {
  return { id: uid(), name: '', value: '', inline: false };
}

export function createDefaultEmbed(): Embed {
  return {
    id: uid(),
    title: '',
    url: '',
    description: '',
    color: 5793266,
    fields: [],
    author: { name: '', url: '', icon_url: '' },
    thumbnail: { url: '' },
    image: { url: '' },
    footer: { text: '', icon_url: '' },
    timestamp: '',
  };
}

export function createDefaultMessage(): Message {
  return {
    id: uid(),
    content: '',
    username: '',
    avatar_url: '',
    tts: false,
    embeds: [],
    flags: 0,
  };
}

export function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.substring(0, len) + '...';
}

/** Copy after async work (clipboard API often rejects without a fresh user gesture). */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Messages safe to JSON.stringify for share API (no File / blob refs). */
export function messagesForSharePayload(messages: Message[]): Message[] {
  return stripTransientAttachmentsFromMessages(messages).map((message) => {
    const { _attachments, components: _components, loadedFromMessageId: _loadedFromMessageId, loadedAttachmentIds: _loadedAttachmentIds, loadedPayload: _loadedPayload, sentBlobUrls: _sentBlobUrls, ...rest } = message;
    const localUrls = new Map((_attachments ?? []).filter(a => a.file || a.fileId || a.previewUrl.startsWith('local-file:') || a.previewUrl.startsWith('blob:')).map(a => [a.previewUrl, '']));
    for (const attachment of _attachments ?? []) {
      if (attachment.name || attachment.file?.name) localUrls.set(`attachment://${attachment.name ?? attachment.file?.name}`, '');
    }
    return replaceLocalUrls(rest, localUrls);
  });
}

export function calculateTotalEmbedLength(msg: Message): number {
  if (isComponentsV2(msg)) return 0;
  return (msg.embeds ?? []).reduce((total, embed) => total + embedTextLength(embed), 0);
}

export function intToHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toOptionalString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toOptionalNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toOptionalBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeImportedAttachment(value: unknown, index: number): FileAttachment | null {
  if (!isPlainObject(value)) return null;

  const previewUrl =
    typeof value.previewUrl === 'string'
      ? value.previewUrl
      : typeof value.url === 'string'
        ? value.url
        : typeof value.proxy_url === 'string'
          ? value.proxy_url
          : '';

  if (!previewUrl) return null;

  return {
    fieldKey:
      typeof value.fieldKey === 'string' && value.fieldKey.trim().length > 0
        ? value.fieldKey
        : `content_file_${index}`,
    previewUrl,
    fileId: typeof value.fileId === 'string' ? value.fileId : undefined,
    discordId: typeof value.discordId === 'string' ? value.discordId : typeof value.id === 'string' ? value.id : undefined,
    platformMediaId: typeof value.platformMediaId === 'string' && /^[a-f0-9-]{36}$/.test(value.platformMediaId) ? value.platformMediaId : undefined,
    name:
      typeof value.name === 'string'
        ? value.name
        : typeof value.filename === 'string'
          ? value.filename
          : undefined,
    size: typeof value.size === 'number' && Number.isFinite(value.size) ? value.size : undefined,
    mimeType:
      typeof value.mimeType === 'string'
        ? value.mimeType
        : typeof value.content_type === 'string'
          ? value.content_type
          : undefined,
  };
}

function normalizeImportedField(value: unknown): Field {
  if (!isPlainObject(value)) return createDefaultField();

  return {
    id: typeof value.id === 'string' && value.id.trim().length > 0 ? value.id : uid(),
    name: toOptionalString(value.name),
    value: toOptionalString(value.value),
    inline: toOptionalBoolean(value.inline),
  };
}

function normalizeImportedEmbed(value: unknown): Embed {
  if (!isPlainObject(value)) return createDefaultEmbed();

  const embed = createDefaultEmbed();
  embed.id = typeof value.id === 'string' && value.id.trim().length > 0 ? value.id : uid();
  embed.title = toOptionalString(value.title);
  embed.url = toOptionalString(value.url);
  embed.description = toOptionalString(value.description);
  embed.color = toOptionalNumber(value.color, embed.color);
  if (value.colorExplicit === false) embed.colorExplicit = false;
  embed.timestamp = toOptionalString(value.timestamp);

  const author = isPlainObject(value.author) ? value.author : undefined;
  embed.author = {
    name: toOptionalString(author?.name),
    url: toOptionalString(author?.url),
    icon_url: toOptionalString(author?.icon_url),
  };

  const thumbnail = isPlainObject(value.thumbnail) ? value.thumbnail : undefined;
  embed.thumbnail = {
    url: toOptionalString(thumbnail?.url),
    width: typeof thumbnail?.width === 'number' ? thumbnail.width : undefined,
    height: typeof thumbnail?.height === 'number' ? thumbnail.height : undefined,
  };

  const image = isPlainObject(value.image) ? value.image : undefined;
  embed.image = {
    url: toOptionalString(image?.url),
    width: typeof image?.width === 'number' ? image.width : undefined,
    height: typeof image?.height === 'number' ? image.height : undefined,
  };

  const footer = isPlainObject(value.footer) ? value.footer : undefined;
  embed.footer = {
    text: toOptionalString(footer?.text),
    icon_url: toOptionalString(footer?.icon_url),
  };

  embed.fields = Array.isArray(value.fields) ? value.fields.map(normalizeImportedField) : [];
  return embed;
}



function normalizeImportedMessage(value: unknown): Message {
  if (!isPlainObject(value)) return createDefaultMessage();
  if (hasUnsupportedDiscordComponents(value.components)) throw new Error('This message contains interactive or unsupported components. Import only webhook-compatible components.');
  const incomingBlocks = blocksFromDiscord(value.components, value.attachments);
  const incomingV2 = value.componentMode === 'v2' || (typeof value.flags === 'number' && (value.flags & COMPONENTS_V2_FLAG) !== 0);

  const attachments = Array.isArray(value._attachments)
    ? value._attachments
        .map((attachment, index) => normalizeImportedAttachment(attachment, index))
        .filter((attachment): attachment is FileAttachment => attachment !== null)
    : [];

  return stripTransientAttachmentsFromMessage({
    id: typeof value.id === 'string' && value.id.trim().length > 0 ? value.id : uid(),
    content: toOptionalString(value.content),
    username: toOptionalString(value.username),
    avatar_url: toOptionalString(value.avatar_url),
    tts: toOptionalBoolean(value.tts),
    embeds: Array.isArray(value.embeds) ? value.embeds.map(normalizeImportedEmbed) : [],
    componentMode: incomingV2 ? 'v2' : 'standard',
    linkButtons: value.linkButtons === undefined && !incomingV2 ? incomingBlocks.filter(block => block.type === 'links').flatMap(block => block.type === 'links' ? block.buttons : []) : normalizeLinkButtons(value.linkButtons),
    componentBlocks: value.componentBlocks === undefined && incomingV2 ? incomingBlocks : normalizeComponentBlocks(value.componentBlocks),
    flags: toOptionalNumber(value.flags, 0),
    thread_name: typeof value.thread_name === 'string' ? value.thread_name : undefined,
    _attachments: attachments.length > 0 ? attachments : undefined,
    loadedFromMessageId: toOptionalString(value.loadedFromMessageId) || undefined,
    loadedAttachmentIds: Array.isArray(value.loadedAttachmentIds) ? value.loadedAttachmentIds.filter((id): id is string => typeof id === 'string') : undefined,
    loadedPayload: isPlainObject(value.loadedPayload) ? value.loadedPayload as DiscordWebhookPayload : undefined,
    sentBlobUrls: Array.isArray(value.sentBlobUrls) ? value.sentBlobUrls.filter((url): url is string => typeof url === 'string' && (url.startsWith('blob:') || url.startsWith('local-file:'))) : undefined,
  });
}

function normalizeImportedTab(value: unknown, index: number): Tab {
  if (!isPlainObject(value)) {
    return {
      id: uid(),
      name: `Imported Draft ${index + 1}`,
      webhookUrl: '',
      messages: [createDefaultMessage()],
    };
  }

  const messages = Array.isArray(value.messages)
    ? value.messages.map(normalizeImportedMessage)
    : [createDefaultMessage()];

  return {
    id: typeof value.id === 'string' && value.id.trim().length > 0 ? value.id : uid(),
    name:
      typeof value.name === 'string' && value.name.trim().length > 0
        ? value.name
        : `Imported Draft ${index + 1}`,
    webhookUrl: toOptionalString(value.webhookUrl),
    messages: messages.length > 0 ? messages : [createDefaultMessage()],
    isTemporarySharedDraft:
      value.isTemporarySharedDraft === true ||
      (typeof value.temporaryShareExpiresAt === 'number' && Number.isFinite(value.temporaryShareExpiresAt))
        ? true
        : undefined,
    temporaryShareExpiresAt:
      typeof value.temporaryShareExpiresAt === 'number' && Number.isFinite(value.temporaryShareExpiresAt)
        ? value.temporaryShareExpiresAt
        : undefined,
  };
}

function looksLikeImportedTab(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && Array.isArray(value.messages);
}

function looksLikeImportedMessage(value: unknown): value is Record<string, unknown> {
  return (
    isPlainObject(value) &&
    (
      'content' in value ||
      'embeds' in value ||
      'username' in value ||
      'avatar_url' in value ||
      'flags' in value ||
      'tts' in value ||
      'thread_name' in value ||
      'components' in value ||
      'componentBlocks' in value ||
      'linkButtons' in value ||
      '_attachments' in value
    )
  );
}

export function parseImportedDraftData(data: unknown): Tab[] {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      throw new Error('Invalid draft format');
    }

    if (data.every(looksLikeImportedTab)) {
      return stripTransientAttachmentsFromTabs(data.map(normalizeImportedTab));
    }

    if (data.every(looksLikeImportedMessage)) {
      return stripTransientAttachmentsFromTabs([
        {
          id: uid(),
          name: 'Imported Draft',
          webhookUrl: '',
          messages: data.map(normalizeImportedMessage),
        },
      ]);
    }
  }

  if (isPlainObject(data)) {
    if (looksLikeImportedTab(data)) {
      return stripTransientAttachmentsFromTabs([normalizeImportedTab(data, 0)]);
    }

    if (looksLikeImportedMessage(data)) {
      return stripTransientAttachmentsFromTabs([
        {
          id: uid(),
          name: 'Imported Draft',
          webhookUrl: '',
          messages: [normalizeImportedMessage(data)],
        },
      ]);
    }
  }

  throw new Error('Invalid draft format');
}

export function parseDiscordPayloadToMessage(data: Record<string, unknown>): Message {
  const msg = createDefaultMessage();
  if (!data) return msg;

  msg.content = typeof data.content === 'string' ? data.content : '';
  if (typeof data.id === 'string') msg.loadedFromMessageId = data.id;
  if (typeof data.flags === 'number') msg.flags = data.flags;
  const messageAttachments = discordMessageAttachments(data);
  if (Array.isArray(data.components)) {
    const blocks = blocksFromDiscord(data.components, messageAttachments);
    if ((msg.flags & COMPONENTS_V2_FLAG) !== 0) { msg.componentMode = 'v2'; msg.componentBlocks = blocks; }
    else msg.linkButtons = blocks.filter(block => block.type === 'links').flatMap(block => block.type === 'links' ? block.buttons : []);
  }
  
  const author = data.author as Record<string, unknown> | undefined;
  if (author && typeof author.username === 'string') msg.username = author.username;
  
  if (Array.isArray(data.embeds)) {
    // Discord includes auto-generated image/link previews alongside webhook-authored
    // rich embeds. Only rich embeds can be edited and sent back as webhook embeds.
    msg.embeds = data.embeds.filter((e: unknown) => isPlainObject(e) && (e.type === undefined || e.type === 'rich')).map((e: Record<string, unknown>) => {
      const embed = createDefaultEmbed();
      if (typeof e.title === 'string') embed.title = e.title;
      if (typeof e.description === 'string') embed.description = e.description;
      if (typeof e.url === 'string') embed.url = e.url;
      if (typeof e.color === 'number') embed.color = e.color;
      else { embed.color = 0x4f545c; embed.colorExplicit = false; }
      if (typeof e.timestamp === 'string') embed.timestamp = e.timestamp;
      
      const footer = e.footer as Record<string, unknown> | undefined;
      if (footer) {
        embed.footer.text = typeof footer.text === 'string' ? footer.text : '';
        if (typeof footer.icon_url === 'string') embed.footer.icon_url = footer.icon_url;
      }
      const image = e.image as Record<string, unknown> | undefined;
      if (typeof image?.url === 'string') {
        embed.image.url = image.url;
        embed.image.width = typeof image.width === 'number' ? image.width : undefined;
        embed.image.height = typeof image.height === 'number' ? image.height : undefined;
      }
      const thumbnail = e.thumbnail as Record<string, unknown> | undefined;
      if (typeof thumbnail?.url === 'string') {
        embed.thumbnail.url = thumbnail.url;
        embed.thumbnail.width = typeof thumbnail.width === 'number' ? thumbnail.width : undefined;
        embed.thumbnail.height = typeof thumbnail.height === 'number' ? thumbnail.height : undefined;
      }
      const embedAuthor = e.author as Record<string, unknown> | undefined;
      if (embedAuthor) {
        embed.author.name = typeof embedAuthor.name === 'string' ? embedAuthor.name : '';
        if (typeof embedAuthor.url === 'string') embed.author.url = embedAuthor.url;
        if (typeof embedAuthor.icon_url === 'string') embed.author.icon_url = embedAuthor.icon_url;
      }
      if (Array.isArray(e.fields)) {
        embed.fields = e.fields.map((f: Record<string, unknown>) => ({
          id: uid(),
          name: typeof f.name === 'string' ? f.name : '',
          value: typeof f.value === 'string' ? f.value : '',
          inline: !!f.inline
        }));
      }
      return embed;
    });
  }

  if (Array.isArray(data.attachments) || messageAttachments.length) {
    msg.loadedAttachmentIds = messageAttachments.map(attachment => attachment.id);
    const attachments = messageAttachments
      .map((attachment, index) => normalizeImportedAttachment(attachment, index))
      .filter((attachment): attachment is FileAttachment => attachment !== null)
      .map((attachment, index) => ({
        ...attachment,
        fieldKey: `content_file_${index}`,
      }));

    if (attachments.length > 0) {
      msg._attachments = attachments;
    }
  }

  return stripTransientAttachmentsFromMessage(msg);
}
