/** Shared bot/dashboard contracts. Tokens never belong in public API responses. */
export interface BotConnection {
  id: string;
  ownerId: string;
  applicationId: string;
  name: string;
  publicKey: string;
  token?: string;
}

export interface BotChoice { label: string; value: string; description?: string; emoji?: string }

export type BotFieldType = 'short' | 'paragraph' | 'select' | 'user' | 'role' | 'mentionable' | 'channel' | 'file' | 'radio' | 'checkboxes' | 'checkbox';
export interface BotFormField {
  id: string;
  label: string;
  type: BotFieldType;
  description?: string;
  placeholder?: string;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  minValues?: number;
  maxValues?: number;
  options?: BotChoice[];
  channelTypes?: number[];
}

export interface BotForm {
  id: string;
  botId: string;
  guildId: string;
  title: string;
  fields: BotFormField[];
  confirmation: string;
  responseChannelId?: string;
  enabled: boolean;
}

export interface BotAction {
  id: string;
  botId: string;
  guildId: string;
  type: 'role' | 'form' | 'reply';
  label: string;
  style: 1 | 2 | 3 | 4;
  emoji?: string;
  roleIds?: string[];
  /** Optional role labels, used by string-select menus and button groups. */
  options?: BotChoice[];
  selection?: 'buttons' | 'string-select' | 'role-select';
  minValues?: number;
  maxValues?: number;
  formId?: string;
  response?: string;
  enabled: boolean;
}

export interface BotCommand {
  id: string;
  botId: string;
  guildId: string;
  name: string;
  type: 1 | 2 | 3;
  description?: string;
  actionId?: string;
  formId?: string;
  response?: string;
  /** Empty means usable by everyone; a decimal permission bitset narrows access. */
  defaultMemberPermissions?: string;
  enabled: boolean;
}

export type BotAnswer = string | string[] | boolean;
export interface BotFormSubmission {
  id: string;
  botId: string;
  guildId: string;
  channelId: string;
  formId: string;
  formTitle: string;
  userId: string;
  username: string;
  submittedAt: string;
  answers: Record<string, BotAnswer>;
  /** File metadata only; no private user data or interaction token is persisted. */
  attachments?: Array<{ id: string; filename: string; url: string; size: number; contentType?: string }>;
}

export interface DiscordRole {
  id: string;
  name: string;
  position: number;
  permissions: string;
  managed?: boolean;
}

export interface DiscordMember {
  user?: { id: string; username?: string; global_name?: string | null };
  roles: string[];
  permissions?: string;
}

export interface DiscordChannel {
  id: string;
  guild_id?: string;
  name?: string;
  type: number;
  parent_id?: string | null;
  permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }>;
}

export interface DiscordInteraction {
  id: string;
  application_id: string;
  type: number;
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: DiscordMember;
  user?: { id: string; username?: string; global_name?: string | null };
  app_permissions?: string;
  data?: {
    id?: string;
    name?: string;
    type?: number;
    custom_id?: string;
    component_type?: number;
    values?: string[];
    target_id?: string;
    components?: Record<string, unknown>[];
    resolved?: {
      attachments?: Record<string, { id: string; filename: string; url: string; size: number; content_type?: string }>;
    };
  };
}

export type DiscordObject = Record<string, unknown>;
export interface InteractionResponse { type: number; data?: DiscordObject }

/** Every lookup must be scoped to bot + guild; claim must use a DB uniqueness constraint. */
export interface BotRepository {
  getAction(botId: string, guildId: string, id: string): Promise<BotAction | null>;
  getForm(botId: string, guildId: string, id: string): Promise<BotForm | null>;
  getCommand(botId: string, guildId: string, name: string, type: number): Promise<BotCommand | null>;
  claimInteraction(botId: string, interactionId: string): Promise<boolean>;
  saveSubmission(submission: BotFormSubmission): Promise<void>;
}

export interface InteractionPlan {
  response: InteractionResponse;
  /** Schedule after returning the response, using Next after() or a durable job. */
  run?: () => Promise<void>;
}
