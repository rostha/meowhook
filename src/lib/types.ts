import type { AppTheme } from './themes';

export type EditorSectionKey = 'profile' | 'content' | 'files' | 'embeds' | 'components' | 'advanced';

export interface EditorFocusTarget {
  requestId: string;
  messageIndex: number;
  section: EditorSectionKey;
  embedId?: string;
  fieldId?: string;
  componentId?: string;
  inputLabel?: string;
  embedSection?: 'fields' | 'images' | 'author' | 'footer';
  source?: 'preview' | 'shortcut' | 'editor';
}

export interface FileAttachment {
  file?: File;
  fileId?: string;
  /** Discord's ID for a file already present on a loaded message. */
  discordId?: string;
  /** Durable dashboard upload; the bot sender verifies its owner before attaching it. */
  platformMediaId?: string;
  previewUrl: string;
  fieldKey: string;
  name?: string;
  size?: number;
  mimeType?: string;
}

export interface LinkButton { id: string; label: string; url: string; emoji?: string; disabled?: boolean; }
export type ComponentBlock =
  | { id: string; type: 'text'; content: string }
  | { id: string; type: 'section'; content: string; texts?: { id: string; content: string }[]; accessory?: 'thumbnail' | 'link'; button?: LinkButton; url: string; description: string; spoiler?: boolean }
  | { id: string; type: 'gallery'; items: { id: string; url: string; description: string; spoiler?: boolean; mimeType?: string }[] }
  | { id: string; type: 'file'; url: string; spoiler?: boolean }
  | { id: string; type: 'separator'; divider: boolean; spacing: 1 | 2 }
  | { id: string; type: 'container'; color: number; colorExplicit?: boolean; spoiler?: boolean; blocks: ComponentBlock[] }
  | { id: string; type: 'links'; buttons: LinkButton[] };

export interface Message {
  id: string;
  content: string;
  username: string;
  avatar_url: string;
  tts: boolean;
  embeds: Embed[];
  flags: number;
  thread_name?: string;
  componentMode?: 'standard' | 'v2';
  linkButtons?: LinkButton[];
  componentBlocks?: ComponentBlock[];
  /** Kept only to read older saved drafts; the editor and sender ignore it. */
  components?: unknown[];
  _attachments?: FileAttachment[];
  /** Identifies a message loaded from Discord so edits can safely retain/remove its files. */
  loadedFromMessageId?: string;
  loadedAttachmentIds?: string[];
  /** Editable fields as they were when this message was loaded or last updated. */
  loadedPayload?: DiscordWebhookPayload;
  /** Local uploads already sent to loadedFromMessageId; never upload them twice on edit. */
  sentBlobUrls?: string[];
}

export interface Tab {
  id: string;
  name: string;
  messages: Message[];
  webhookUrl: string;
  isTemporarySharedDraft?: boolean;
  temporaryShareExpiresAt?: number;
}


export interface Embed {
  id: string;
  title: string;
  url: string;
  description: string;
  color: number;
  /** False when a loaded Discord embed has no accent color. */
  colorExplicit?: boolean;
  fields: Field[];
  author: { name: string; url: string; icon_url: string };
  thumbnail: { url: string; width?: number; height?: number };
  image: { url: string; width?: number; height?: number };
  footer: { text: string; icon_url: string };
  timestamp: string;
}

export interface Field {
  id: string;
  name: string;
  value: string;
  inline: boolean;
}

export interface WebhookInfo {
  name: string;
  avatar: string | null;
  id: string;
  channel_id: string;
  guild_id: string;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface Settings {
  theme: AppTheme;
  sidebarCollapsed?: boolean;
}

export interface SavedWebhook {
  name: string;
  url: string;
}

export interface SavedTemplate {
  id?: string; // Optional for backward compatibility; new templates will have IDs
  name: string;
  emoji: string;
  messages: Message[];
}

export interface SavedBackup {
  name: string;
  tabs: Tab[];
  timestamp: number;
}

export interface SendProgress {
  totalMessages: number;
  currentMessage: number;
  totalBatches: number;
  currentBatch: number;
  isWaiting: boolean;
  waitSeconds: number;
  status: 'idle' | 'sending' | 'waiting' | 'error' | 'success';
  error: string | null;
}

/** Discord API payload types — mirrors what Discord's webhook endpoint expects. */

export interface DiscordEmbedAuthorPayload {
  name: string;
  url?: string;
  icon_url?: string;
}

export interface DiscordEmbedFooterPayload {
  text: string;
  icon_url?: string;
}

export interface DiscordEmbedFieldPayload {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbedPayload {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  timestamp?: string;
  author?: DiscordEmbedAuthorPayload;
  thumbnail?: { url: string; width?: number; height?: number };
  image?: { url: string; width?: number; height?: number };
  footer?: DiscordEmbedFooterPayload;
  fields?: DiscordEmbedFieldPayload[];
}

export interface DiscordLinkButtonPayload { type: 2; style: 5; label?: string; url: string; emoji?: { name?: string; id?: string; animated?: boolean }; disabled?: boolean; }
export type DiscordComponentPayload =
  | { type: 1; components: DiscordLinkButtonPayload[] }
  | { type: 9; components: Array<{ type: 10; content: string }>; accessory: DiscordLinkButtonPayload | { type: 11; media: { url: string }; description?: string; spoiler?: boolean } }
  | { type: 10; content: string }
  | { type: 12; items: Array<{ media: { url: string }; description?: string; spoiler?: boolean }> }
  | { type: 13; file: { url: string }; spoiler?: boolean }
  | { type: 14; divider: boolean; spacing: 1 | 2 }
  | { type: 17; accent_color?: number | null; spoiler?: boolean; components: DiscordComponentPayload[] };

export interface DiscordWebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  tts?: boolean;
  flags?: number;
  embeds?: DiscordEmbedPayload[];
  components?: DiscordComponentPayload[];
  thread_name?: string;
  attachments?: Array<{ id: string | number; filename?: string }>;
}

/** Discord accepts null content when a regular sent message becomes Components V2. */
export type DiscordWebhookEditPayload = Omit<DiscordWebhookPayload, 'content'> & { content?: string | null };

/** Partial shape of a Discord API message response. */
export interface DiscordMessageResponse {
  id: string;
  content: string;
  webhook_id?: string;
  author?: { username: string; avatar?: string | null };
  embeds?: Array<Record<string, unknown>>;
  attachments?: Array<Record<string, unknown>>;
  components?: Array<Record<string, unknown>>;
  flags?: number;
}

/** Raw data from a pasted / imported JSON that has unverified structure. */
export type UntypedPayload = Record<string, unknown>;
