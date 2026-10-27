import { randomUUID } from 'node:crypto';
import { validateBotAction, validateBotCommand, validateBotForm, SNOWFLAKE } from '@/lib/bot/validation';
import type { BotAction, BotCommand, BotForm } from '@/lib/bot/types';
import { createDefaultMessage, parseDiscordPayloadToMessage } from '@/lib/utils';
import { buildPayload, getSendBlockingReason } from '@/lib/payload';
import type { FileAttachment, Message } from '@/lib/types';
import { activeMessageAttachments } from '@/lib/componentAttachments';
import { mediaIdFromUrl } from './media';
import { applicationId } from './config';
import { PlatformError } from './http';
import type { ResourceName } from './types';
import { sanitizeBotMessagePayload } from '@/lib/bot/messagePayload';

export function plain(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new PlatformError(`${label} needs ${required ? '1–' : 'up to '}${max.toLocaleString()} characters.`);
  return value;
}
export function discordId(value: unknown, label: string, optional = true): string {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !SNOWFLAKE.test(value)) throw new PlatformError(`Choose a valid ${label}.`);
  return value;
}
export function checkHostedMedia(value: unknown, depth = 0): void {
  if (depth > 15) throw new PlatformError('This message is nested too deeply.');
  if (Array.isArray(value)) { value.forEach(item => checkHostedMedia(item, depth + 1)); return; }
  if (!plain(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (['url', 'icon_url', 'avatar_url'].includes(key) && typeof item === 'string' && item) {
      let url: URL;
      try { url = new URL(item); } catch { throw new PlatformError('Upload files or use an HTTPS media URL before saving.'); }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new PlatformError('Upload files or use an HTTPS media URL before saving.');
    }
    checkHostedMedia(item, depth + 1);
  }
}
/** Dashboard documents stay editable; dispatch performs strict Discord validation. */
export function normalizeMessage(body: Record<string, unknown>) {
  const name = text(body.name, 'Message name', 100, true);
  if (!plain(body.payload)) throw new PlatformError('A message payload is required.');
  const rawFiles = body.payload._meowhookFiles;
  if (rawFiles !== undefined && (!Array.isArray(rawFiles) || rawFiles.length > 10)) throw new PlatformError('Choose up to ten uploaded files.');
  const rawAttachments: FileAttachment[] = (rawFiles as unknown[] | undefined || []).map(value => {
    if (!plain(value) || typeof value.url !== 'string' || !mediaIdFromUrl(value.url) || typeof value.name !== 'string' || !value.name || value.name.length > 255 ||
      typeof value.fieldKey !== 'string' || value.fieldKey.length > 200 || /[\x00-\x1F\x7F/\\]/.test(value.name)) throw new PlatformError('One of the uploaded file references is invalid.');
    return { previewUrl: value.url, name: value.name, fieldKey: value.fieldKey, platformMediaId: mediaIdFromUrl(value.url)! };
  });
  const namedFiles = new Map(rawAttachments.flatMap(file => [[file.name, file.previewUrl], [mediaIdFromUrl(file.previewUrl)!, file.previewUrl]]));
  const restoreFileReferences = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(restoreFileReferences);
    if (!plain(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      if (['url', 'icon_url', 'avatar_url'].includes(key) && typeof child === 'string' && child.startsWith('attachment://')) {
        const url = namedFiles.get(child.slice('attachment://'.length));
        if (!url) throw new PlatformError('This message references a file that has not been uploaded.');
        return [key, url];
      }
      return [key, restoreFileReferences(child)];
    }));
  };
  const sourcePayload = restoreFileReferences(body.payload) as Record<string, unknown>;
  checkHostedMedia(sourcePayload);
  // Action custom IDs are generated from owned action records, never accepted as raw arbitrary IDs.
  const checkComponents = (components: unknown, depth = 0) => {
    if (components === undefined) return;
    if (depth > 4 || !Array.isArray(components) || components.length > 40) throw new PlatformError('This component layout is invalid.');
    for (const node of components) {
      if (!plain(node) || typeof node.type !== 'number' || ![1, 2, 9, 10, 11, 12, 13, 14, 17].includes(node.type)) throw new PlatformError('Choose supported message components.');
      if ('custom_id' in node || (node.type === 2 && node.style !== 5)) throw new PlatformError('Add interactive buttons and menus from your saved actions.');
      if (node.components !== undefined) checkComponents(node.components, depth + 1);
      if (node.accessory) checkComponents([node.accessory], depth + 1);
    }
  };
  checkComponents(sourcePayload.components);
  const visual = body.editorMessage;
  let editorMessage: Message;
  if (visual !== undefined) {
    if (!plain(visual) || typeof visual.content !== 'string' || !Array.isArray(visual.embeds)) throw new PlatformError('This visual editor document is invalid.');
    if (Array.isArray(visual._attachments) && visual._attachments.some(file => !plain(file) || file.file || !mediaIdFromUrl(String(file.previewUrl)))) throw new PlatformError('Finish uploading attached files before saving.');
    checkHostedMedia(visual);
    editorMessage = { ...createDefaultMessage(), ...visual } as Message;
  } else {
    editorMessage = parseDiscordPayloadToMessage(sourcePayload);
    if (rawAttachments.length) {
      editorMessage._attachments = rawAttachments;
      // Discord file blocks serialize as attachment references; restore their durable
      // source so editing raw JSON cannot detach the bytes from the visual document.
      const restore = (blocks: import('@/lib/types').ComponentBlock[]): import('@/lib/types').ComponentBlock[] => blocks.map(block =>
        block.type === 'container' ? { ...block, blocks: restore(block.blocks) }
          : block.type === 'file' ? { ...block, url: namedFiles.get(block.url.replace('attachment://', '')) || block.url } : block);
      editorMessage.componentBlocks = restore(editorMessage.componentBlocks || []);
    }
  }
  editorMessage._attachments = editorMessage._attachments?.map(attachment => ({ ...attachment, platformMediaId: mediaIdFromUrl(attachment.previewUrl) || undefined }));
  let serialized;
  try { serialized = buildPayload(editorMessage); }
  catch { throw new PlatformError('This message contains an invalid embed or component.'); }
  const { username: _name, avatar_url: _avatar, thread_name: _thread, attachments: _attachments, ...payload } = serialized;
  if (!Array.isArray(body.actionIds) || body.actionIds.length > 25 || body.actionIds.some(id => typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id))) throw new PlatformError('Choose up to 25 saved actions.');
  const fileUrls: string[] = [];
  const collectFiles = (blocks: import('@/lib/types').ComponentBlock[]) => { for (const block of blocks) { if (block.type === 'container') collectFiles(block.blocks); else if (block.type === 'file') fileUrls.push(block.url); } };
  collectFiles(editorMessage.componentBlocks || []);
  const files = activeMessageAttachments(editorMessage).filter(attachment => attachment.platformMediaId && (attachment.fieldKey.startsWith('content_file_') || fileUrls.includes(attachment.previewUrl) || fileUrls.includes(`attachment://${attachment.name}`)))
    .map(attachment => ({ url: attachment.previewUrl, name: attachment.name || 'file', fieldKey: attachment.fieldKey }));
  return { name, guildId: discordId(body.guildId, 'server'), channelId: discordId(body.channelId, 'channel'), payload: { ...sanitizeBotMessagePayload(payload), ...(files.length ? { _meowhookFiles: files } : {}) }, editorMessage, actionIds: [...new Set(body.actionIds)] };
}
export function validateDispatch(payload: Record<string, unknown>, hasActions = false): string | null {
  try {
    // Bot actions form a complete message by themselves, including in V2 mode.
    if (hasActions && typeof payload.flags === 'number' && (payload.flags & 32768) && (payload.components === undefined || (Array.isArray(payload.components) && payload.components.length === 0))) return null;
    const message = parseDiscordPayloadToMessage(payload);
    if (Array.isArray(payload._meowhookFiles)) {
      message._attachments = payload._meowhookFiles.filter(plain).map((file, index) => ({ previewUrl: String(file.url), name: String(file.name), fieldKey: String(file.fieldKey), platformMediaId: mediaIdFromUrl(String(file.url)) || undefined }));
      const byName = new Map(message._attachments.flatMap(file => [[file.name, file.previewUrl], [new URL(file.previewUrl).pathname.split('/').pop(), file.previewUrl]]));
      const restore = (blocks: import('@/lib/types').ComponentBlock[]): import('@/lib/types').ComponentBlock[] => blocks.map(block => block.type === 'container' ? { ...block, blocks: restore(block.blocks) } : block.type === 'file' ? { ...block, url: byName.get(block.url.replace('attachment://', '')) || block.url } : block);
      message.componentBlocks = restore(message.componentBlocks || []);
    }
    const reason = getSendBlockingReason([message], [message._attachments?.length || 0]);
    if (hasActions && reason?.startsWith('Nothing to send')) return null;
    if (reason?.startsWith('Links need a message')) return null;
    return reason?.replace('\n', ': ') || null;
  } catch { return 'This message has an invalid embed or component.'; }
}
export function normalizeResource(kind: ResourceName, body: Record<string, unknown>, existingId?: string): Record<string, unknown> {
  if (kind === 'messages') return normalizeMessage(body);
  const base = { id: existingId || randomUUID(), botId: applicationId(), guildId: discordId(body.guildId, 'server'), enabled: body.enabled === undefined ? true : body.enabled };
  let item: Record<string, unknown>; let issue: string | null;
  if (kind === 'actions') {
    const { type, label, style, emoji, roleIds, options, selection, minValues, maxValues, formId, response } = body;
    item = { type, label, style, emoji, roleIds, options, selection, minValues, maxValues, formId, response, ...base };
    issue = validateBotAction(item as unknown as BotAction);
  } else if (kind === 'forms') {
    const { title, fields, confirmation, responseChannelId } = body;
    item = { title, fields, confirmation: confirmation ?? 'Thanks! Your response has been saved.', responseChannelId: discordId(responseChannelId, 'response channel'), ...base };
    issue = validateBotForm(item as unknown as BotForm);
  } else if (kind === 'commands') {
    const { name, type, description, actionId, formId, response, defaultMemberPermissions } = body;
    item = { name, type, description, actionId, formId, response, defaultMemberPermissions: defaultMemberPermissions || undefined, ...base };
    issue = validateBotCommand(item as unknown as BotCommand);
  } else throw new PlatformError('This section is read only.', 405);
  if (issue) throw new PlatformError(issue);
  return item;
}
