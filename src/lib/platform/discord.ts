import { getAuth } from '@/lib/auth';
import { DiscordRestClient, DiscordRestError, paginateDiscordGuilds } from '@/lib/bot/rest';
import { hasPermission, permissionBits, PERMISSIONS, assertSelfRolePermissions } from '@/lib/bot/permissions';
import { applicationId, platformStatus } from './config';
import { PlatformError } from './http';
import type { GuildSummary, RoleSummary } from './types';

export function botClient() {
  if (!platformStatus().botConfigured) throw new PlatformError('The Meowhook bot is not connected yet. You can keep building and saving.', 503);
  return new DiscordRestClient(process.env.DISCORD_BOT_TOKEN!);
}
export async function discordAccessToken(headers: Headers) {
  try {
    const auth = await getAuth();
    const accounts = await auth.api.listUserAccounts({ headers });
    const account = accounts.find(account => account.providerId === 'discord');
    if (!account) return null;
    const result = await auth.api.getAccessToken({ headers, body: { accountId: account.id } });
    return result.accessToken || null;
  } catch { return null; }
}
interface UserGuild { id: string; name: string; icon: string | null; owner: boolean; permissions: string }
async function fetchUserGuilds(token: string): Promise<UserGuild[]> {
  try {
    return await paginateDiscordGuilds(async after => {
      const result = await fetch(`https://discord.com/api/v10/users/@me/guilds?limit=200${after ? `&after=${after}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
      });
      if (!result.ok) throw new PlatformError(result.status === 401 || result.status === 403 ? 'Reconnect your Discord account to refresh server access.' : 'Discord server access could not be verified. Try again shortly.', result.status === 429 ? 429 : result.status >= 500 ? 502 : 403);
      return await result.json() as UserGuild[];
    });
  } catch (error) {
    if (error instanceof PlatformError) throw error;
    throw new PlatformError(error instanceof Error ? error.message : 'Discord server access could not be fully verified.', 502);
  }
}
async function userGuilds(headers: Headers) {
  const token = await discordAccessToken(headers);
  return token ? fetchUserGuilds(token) : null;
}
export async function requireBackgroundGuild(ownerId: string, guildId: string) {
  const auth = await getAuth();
  const accounts = await (await auth.$context).internalAdapter.findAccounts(ownerId);
  const account = accounts.find(account => account.providerId === 'discord');
  if (!account) throw new PlatformError('The schedule owner needs to connect Discord.', 403);
  const token = await auth.api.getAccessToken({ body: { accountId: account.id, userId: ownerId } });
  const guilds = await fetchUserGuilds(token.accessToken);
  if (!guilds.some(guild => guild.id === guildId && (guild.owner || hasPermission(permissionBits(guild.permissions), PERMISSIONS.MANAGE_GUILD)))) throw new PlatformError('The schedule owner no longer has Manage Server permission.', 403);
}
export async function listGuilds(headers: Headers): Promise<{ items: GuildSummary[]; connected: boolean }> {
  const guilds = await userGuilds(headers);
  if (!guilds) return { items: [], connected: false };
  let botGuilds: Awaited<ReturnType<DiscordRestClient['guilds']>> = [];
  if (platformStatus().botConfigured) {
    try { botGuilds = await botClient().guilds(); }
    catch (error) { throw new PlatformError(error instanceof Error ? error.message : 'Discord bot servers could not be fully verified.', error instanceof DiscordRestError && error.status === 429 ? 429 : 502); }
  }
  const ids = new Set(botGuilds.map(guild => guild.id));
  return { connected: true, items: guilds.filter(guild => guild.owner || hasPermission(permissionBits(guild.permissions), PERMISSIONS.MANAGE_GUILD))
    .map(guild => ({ id: guild.id, name: guild.name, icon: guild.icon, permissions: guild.permissions, botPresent: ids.has(guild.id) })) };
}
export async function requireGuild(headers: Headers, guildId: string, requireBot = false) {
  if (!/^\d{17,20}$/.test(guildId)) throw new PlatformError('Choose a Discord server.');
  const result = await listGuilds(headers);
  const guild = result.items.find(guild => guild.id === guildId);
  if (!guild) throw new PlatformError('You need Manage Server permission in this Discord server.', 403);
  if (requireBot && !guild.botPresent) throw new PlatformError('Add Meowhook to this server before publishing.', 409);
  return guild;
}
export async function guildDetails(headers: Headers, guildId: string) {
  const guild = await requireGuild(headers, guildId, true);
  const client = botClient();
  const bot = await client.currentUser();
  const [channels, roles, self] = await Promise.all([client.channels(guildId), client.roles(guildId), client.member(guildId, bot.id)]);
  const mapped: RoleSummary[] = roles.map(role => {
    let assignable = true;
    try { assertSelfRolePermissions(guildId, self, roles, [role.id], channels); } catch { assignable = false; }
    return { ...role, assignable };
  });
  return { guild, channels: channels.filter(channel => [0, 5, 10, 11, 12].includes(channel.type)).map(channel => ({ id: channel.id, name: channel.name || channel.id, type: channel.type })), roles: mapped };
}
