import type { DiscordChannel, DiscordMember, DiscordRole } from './types';

export const PERMISSIONS = {
  ADMINISTRATOR: BigInt(8),
  MANAGE_GUILD: BigInt(32),
  VIEW_CHANNEL: BigInt(1024),
  SEND_MESSAGES: BigInt(2048),
  SEND_TTS_MESSAGES: BigInt(4096),
  EMBED_LINKS: BigInt(16384),
  ATTACH_FILES: BigInt(32768),
  MANAGE_ROLES: BigInt(268435456),
  SEND_MESSAGES_IN_THREADS: BigInt('274877906944'),
};

export function permissionBits(value: string | undefined): bigint {
  return value && /^\d{1,25}$/.test(value) ? BigInt(value) : BigInt(0);
}

export function hasPermission(bits: bigint, permission: bigint): boolean {
  return (bits & PERMISSIONS.ADMINISTRATOR) !== BigInt(0) || (bits & permission) === permission;
}

export function memberPermissions(guildId: string, member: DiscordMember, roles: DiscordRole[]): bigint {
  return roles.filter(role => role.id === guildId || member.roles.includes(role.id)).reduce((bits, role) => bits | permissionBits(role.permissions), BigInt(0));
}

/** Evaluate overwrites in Discord's order: everyone, aggregated roles, then member. */
export function channelPermissions(guildId: string, member: DiscordMember, roles: DiscordRole[], channel: DiscordChannel): bigint {
  let bits = memberPermissions(guildId, member, roles);
  if (hasPermission(bits, PERMISSIONS.ADMINISTRATOR)) return bits;
  const overwrites = channel.permission_overwrites ?? [];
  const everyone = overwrites.find(overwrite => overwrite.id === guildId && overwrite.type === 0);
  if (everyone) bits = (bits & ~permissionBits(everyone.deny)) | permissionBits(everyone.allow);
  let allow = BigInt(0), deny = BigInt(0);
  for (const overwrite of overwrites) {
    if (overwrite.type !== 0 || overwrite.id === guildId || !member.roles.includes(overwrite.id)) continue;
    allow |= permissionBits(overwrite.allow);
    deny |= permissionBits(overwrite.deny);
  }
  bits = (bits & ~deny) | allow;
  const own = overwrites.find(overwrite => overwrite.type === 1 && overwrite.id === member.user?.id);
  if (own) bits = (bits & ~permissionBits(own.deny)) | permissionBits(own.allow);
  return bits;
}

export function assertCanSendChannel(guildId: string, bot: DiscordMember, roles: DiscordRole[], channel: DiscordChannel, embeds = false, files = false): void {
  if (channel.guild_id && channel.guild_id !== guildId) throw new Error('The channel belongs to a different server.');
  if (![0, 5, 10, 11, 12].includes(channel.type)) throw new Error('Choose a text, announcement, or existing thread channel.');
  const bits = channelPermissions(guildId, bot, roles, channel);
  if (!hasPermission(bits, PERMISSIONS.VIEW_CHANNEL) || !hasPermission(bits, [10, 11, 12].includes(channel.type) ? PERMISSIONS.SEND_MESSAGES_IN_THREADS : PERMISSIONS.SEND_MESSAGES)) throw new Error('The bot needs permission to view and send messages in this channel.');
  if (embeds && !hasPermission(bits, PERMISSIONS.EMBED_LINKS)) throw new Error('The bot needs the Embed Links permission in this channel.');
  if (files && !hasPermission(bits, PERMISSIONS.ATTACH_FILES)) throw new Error('The bot needs the Attach Files permission in this channel.');
}

/** Self-role panels must never grant moderation or administrative powers. */
const UNSAFE_SELF_ROLE_PERMISSIONS = [1, 2, 3, 4, 5, 7, 13, 17, 19, 22, 23, 24, 27, 28, 29, 30, 33, 34, 40, 41, 51, 52].reduce((bits, bit) => bits | (BigInt(1) << BigInt(bit)), BigInt(0));

export function assertSelfRolePermissions(guildId: string, bot: DiscordMember, roles: DiscordRole[], roleIds: string[], channels: DiscordChannel[] = []): void {
  if (!hasPermission(memberPermissions(guildId, bot, roles), PERMISSIONS.MANAGE_ROLES)) throw new Error('The bot needs the Manage Roles permission.');
  const highest = roles.filter(role => bot.roles.includes(role.id)).reduce((position, role) => Math.max(position, role.position), 0);
  for (const roleId of roleIds) {
    const role = roles.find(candidate => candidate.id === roleId);
    if (!role) throw new Error('One of these roles no longer exists.');
    if (role.id === guildId || role.managed) throw new Error('Everyone and integration-managed roles cannot be self assigned.');
    if (role.position >= highest) throw new Error('Move the bot’s role above every self-role in Discord’s role list.');
    if ((permissionBits(role.permissions) & UNSAFE_SELF_ROLE_PERMISSIONS) !== BigInt(0)) throw new Error('Roles with administrative or moderation permissions cannot be self assigned.');
    if (channels.some(channel => channel.permission_overwrites?.some(overwrite => overwrite.type === 0 && overwrite.id === roleId && (permissionBits(overwrite.allow) & UNSAFE_SELF_ROLE_PERMISSIONS) !== BigInt(0)))) throw new Error('Roles that grant administrative or moderation channel permissions cannot be self assigned.');
  }
}
