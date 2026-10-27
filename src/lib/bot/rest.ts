import type { BotCommand, DiscordChannel, DiscordMember, DiscordObject, DiscordRole } from './types';
import { SNOWFLAKE, validateBotCommand } from './validation';
import { sanitizeBotMessagePayload } from './messagePayload';

const API = 'https://discord.com/api/v10';
const id = (value: string) => {
  if (!SNOWFLAKE.test(value)) throw new Error('A valid Discord ID is required.');
  return value;
};

/** Sequential cursor paging; never return a truncated server-access list. */
export async function paginateDiscordGuilds<T extends { id: string }>(fetchPage: (after?: string) => Promise<T[]>): Promise<T[]> {
  const collected = new Map<string, T>();
  const cursors = new Set<string>();
  let after: string | undefined;
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    const page = await fetchPage(after);
    if (!Array.isArray(page) || page.length > 200 || page.some(guild => !guild || typeof guild.id !== 'string' || !SNOWFLAKE.test(guild.id))) throw new Error('Discord returned an invalid server list. Try again shortly.');
    if (!page.length) return [...collected.values()];
    const next = page.reduce((highest, guild) => BigInt(guild.id) > BigInt(highest) ? guild.id : highest, page[0].id);
    if (cursors.has(next) || (after && BigInt(next) <= BigInt(after))) throw new Error('Discord repeated a server page. Access could not be fully verified; try again shortly.');
    for (const guild of page) collected.set(guild.id, guild);
    if (page.length < 200) return [...collected.values()];
    cursors.add(next); after = next;
  }
  throw new Error('Discord returned too many server pages to verify access. Try again shortly.');
}

export class DiscordRestError extends Error {
  constructor(public status: number, public code: number | undefined, public retryAfterMs?: number) {
    super(status === 429 ? 'Discord is rate limiting this action. Try again shortly.'
      : status === 401 ? 'The Discord bot credentials are invalid.'
      : status === 403 ? 'The bot does not have permission to do this in Discord.'
      : status === 404 ? 'This Discord server, channel, member, or message is no longer available.'
      : status >= 500 ? 'Discord could not complete the request. Check the result before retrying.'
      : 'Discord rejected this action. Check the message and bot permissions.');
    this.name = 'DiscordRestError';
  }
}

/** Fixed-origin REST only; credentials cannot be sent to a user-controlled URL. */
export class DiscordRestClient {
  private fetcher: typeof fetch;
  constructor(private token: string, options: { fetch?: typeof fetch } = {}) {
    this.fetcher = options.fetch ?? fetch;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.includes('://')) throw new Error('Invalid Discord API path.');
    if (!this.token) throw new Error('Discord bot connection is not configured.');
    const response = await this.fetcher(`${API}${path}`, {
      method,
      headers: { Authorization: `Bot ${this.token}`, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), 'User-Agent': 'DiscordBot (https://www.meowhook.com, 1.0)' },
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({})) as { code?: number; retry_after?: number };
      const retry = typeof details.retry_after === 'number' && Number.isFinite(details.retry_after)
        ? Math.max(1000, Math.min(3_600_000, Math.ceil(details.retry_after * 1000))) : undefined;
      throw new DiscordRestError(response.status, typeof details.code === 'number' ? details.code : undefined, retry);
    }
    return response.status === 204 ? undefined as T : await response.json() as T;
  }

  currentUser() { return this.request<{ id: string; username: string; avatar?: string | null }>('GET', '/users/@me'); }
  guilds() { return paginateDiscordGuilds(after => this.request<Array<{ id: string; name: string; icon?: string | null; permissions?: string }>>('GET', `/users/@me/guilds?limit=200${after ? `&after=${after}` : ''}`)); }
  guild(guildId: string) { return this.request<{ id: string; name: string; owner_id: string }>('GET', `/guilds/${id(guildId)}`); }
  roles(guildId: string) { return this.request<DiscordRole[]>('GET', `/guilds/${id(guildId)}/roles`); }
  channels(guildId: string) { return this.request<DiscordChannel[]>('GET', `/guilds/${id(guildId)}/channels`); }
  channel(channelId: string) { return this.request<DiscordChannel>('GET', `/channels/${id(channelId)}`); }
  message(channelId: string, messageId: string) { return this.request<{ id: string; channel_id: string; author: { id: string }; flags?: number }>('GET', `/channels/${id(channelId)}/messages/${id(messageId)}`); }
  member(guildId: string, userId: string) { return this.request<DiscordMember>('GET', `/guilds/${id(guildId)}/members/${id(userId)}`); }
  async addRole(guildId: string, userId: string, roleId: string): Promise<void> { await this.request('PUT', `/guilds/${id(guildId)}/members/${id(userId)}/roles/${id(roleId)}`); }
  async removeRole(guildId: string, userId: string, roleId: string): Promise<void> { await this.request('DELETE', `/guilds/${id(guildId)}/members/${id(userId)}/roles/${id(roleId)}`); }

  createMessage(channelId: string, payload: DiscordObject, nonce?: string) {
    if (nonce !== undefined && (!nonce.length || nonce.length > 25)) throw new Error('Message nonce must have 1–25 characters.');
    return this.request<{ id: string; channel_id: string }>('POST', `/channels/${id(channelId)}/messages`, {
      ...sanitizeBotMessagePayload(payload),
      allowed_mentions: { parse: [] },
      ...(nonce ? { nonce, enforce_nonce: true } : {}),
    });
  }

  editMessage(channelId: string, messageId: string, payload: DiscordObject) {
    return this.request<{ id: string; channel_id: string }>('PATCH', `/channels/${id(channelId)}/messages/${id(messageId)}`, { ...payload, allowed_mentions: { parse: [] } });
  }

  createMessageWithFiles(channelId: string, payload: DiscordObject, files: Array<{ name: string; bytes: Uint8Array; contentType?: string }>, nonce?: string) {
    if (nonce !== undefined && (!nonce.length || nonce.length > 25)) throw new Error('Message nonce must have 1–25 characters.');
    return this.request<{ id: string; channel_id: string }>('POST', `/channels/${id(channelId)}/messages`, this.multipart({
      ...sanitizeBotMessagePayload(payload), allowed_mentions: { parse: [] }, ...(nonce ? { nonce, enforce_nonce: true } : {}),
    }, files));
  }

  editMessageWithFiles(channelId: string, messageId: string, payload: DiscordObject, files: Array<{ name: string; bytes: Uint8Array; contentType?: string }>) {
    return this.request<{ id: string; channel_id: string }>('PATCH', `/channels/${id(channelId)}/messages/${id(messageId)}`, this.multipart({ ...payload, allowed_mentions: { parse: [] } }, files));
  }

  private multipart(payload: DiscordObject, files: Array<{ name: string; bytes: Uint8Array; contentType?: string }>): FormData {
    if (!files.length || files.length > 10) throw new Error('Upload between one and ten files per message.');
    const existing = Array.isArray(payload.attachments) ? payload.attachments : [];
    if (existing.length + files.length > 10) throw new Error('Discord allows up to ten attachments per message.');
    const names = new Set<string>();
    const data = new FormData();
    for (const [index, file] of files.entries()) {
      if (!file.name || file.name.length > 255 || /[\x00-\x1F\x7F/\\]/.test(file.name) || names.has(file.name)) throw new Error('Files need unique names without path separators or control characters.');
      if (file.bytes.byteLength > 20 * 1024 * 1024) throw new Error('Files must be 20 MiB or smaller.');
      names.add(file.name);
      data.append(`files[${index}]`, new Blob([new Uint8Array(file.bytes)], { type: file.contentType || 'application/octet-stream' }), file.name);
    }
    const encoded = JSON.stringify({ ...payload, attachments: [...existing, ...files.map((file, index) => ({ id: index, filename: file.name }))] });
    const requestBudget = files.reduce((bytes, file) => bytes + file.bytes.byteLength + 1024, 2048 + new TextEncoder().encode(encoded).byteLength);
    if (requestBudget > 25 * 1024 * 1024) throw new Error('All files and message content together must fit within Discord’s 25 MiB request limit.');
    data.append('payload_json', encoded);
    return data;
  }

  deleteMessage(channelId: string, messageId: string) { return this.request<void>('DELETE', `/channels/${id(channelId)}/messages/${id(messageId)}`); }

  editInteraction(applicationId: string, interactionToken: string, payload: DiscordObject) {
    // Interaction webhook endpoints use only the short-lived interaction token; never Bot auth.
    if (!/^[a-zA-Z0-9._-]{1,512}$/.test(interactionToken)) throw new Error('The interaction token is invalid.');
    return this.fetcher(`${API}/webhooks/${id(applicationId)}/${interactionToken}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(10_000), cache: 'no-store', redirect: 'error',
    }).then(async response => {
      if (!response.ok) throw new DiscordRestError(response.status, undefined);
    });
  }

  syncGuildCommands(applicationId: string, guildId: string, commands: BotCommand[]) {
    if (commands.length > 100) throw new Error('A server can have up to 100 slash commands.');
    const enabled = commands.filter(command => command.enabled);
    if (enabled.filter(command => command.type === 2).length > 5 || enabled.filter(command => command.type === 3).length > 5) throw new Error('Discord allows up to five user commands and five message commands per server.');
    const seen = new Set<string>();
    for (const command of enabled) {
      const issue = validateBotCommand(command);
      if (issue) throw new Error(issue);
      if (command.guildId !== guildId) throw new Error('A command belongs to a different server.');
      const key = `${command.type}:${command.name}`;
      if (seen.has(key)) throw new Error('Command names must be unique within each command type.');
      seen.add(key);
    }
    return this.request<Array<{ id: string; name: string; type: number }>>('PUT', `/applications/${id(applicationId)}/guilds/${id(guildId)}/commands`, enabled.map(command => ({
      name: command.name, type: command.type,
      ...(command.type === 1 ? { description: command.description } : {}),
      default_member_permissions: command.defaultMemberPermissions || null,
    })));
  }
}
