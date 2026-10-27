import { appendActionRows } from '@/lib/bot/components';
import { assertCanSendChannel, assertSelfRolePermissions } from '@/lib/bot/permissions';
import { DiscordRestError } from '@/lib/bot/rest';
import { ScheduledDeliveryError } from '@/lib/scheduling/runner';
import { PlatformRepository } from './repository';
import { botClient } from './discord';
import { applicationId } from './config';
import { getMedia, mediaBytes, mediaIdFromUrl } from './media';
import { PlatformError } from './http';
import { plain, validateDispatch } from './validation';
import { botEditPayload, sanitizeBotMessagePayload } from '@/lib/bot/messagePayload';
import { channelPermissions, hasPermission, PERMISSIONS } from '@/lib/bot/permissions';

export async function prepareDelivery(ownerId: string, guildId: string, channelId: string, payload: Record<string, unknown>, actionIds: string[], options: { editMessageId?: string } = {}) {
  const repository = new PlatformRepository();
  const actions = await Promise.all(actionIds.map(id => repository.get('actions', ownerId, id)));
  const belongsToApp = (botId: string) => botId === applicationId() || botId === 'meowhook';
  if (actions.some(action => !action || !action.enabled || action.guildId !== guildId || !belongsToApp(action.botId))) throw new PlatformError('One of this message’s actions is disabled, missing, or belongs to a different server.');
  for (const action of actions) if (action?.formId) {
    const form = await repository.get('forms', ownerId, action.formId);
    if (!form?.enabled || form.guildId !== guildId || !belongsToApp(form.botId)) throw new PlatformError('One of this message’s forms is disabled or missing.');
  }
  const issue = validateDispatch(payload, actions.length > 0);
  if (issue) throw new PlatformError(issue);
  const body = structuredClone(payload);
  const descriptors = Array.isArray(body._meowhookFiles) ? body._meowhookFiles : [];
  delete body._meowhookFiles; delete body.username; delete body.avatar_url; delete body.thread_name;
  const files: Array<{ name: string; bytes: Uint8Array; contentType?: string }> = [];
  let requestBytes = 2048 + new TextEncoder().encode(JSON.stringify(body)).byteLength;
  const fileUrls = new Map<string, string>();
  for (const descriptor of descriptors) {
    if (!plain(descriptor) || typeof descriptor.url !== 'string') throw new PlatformError('One of this message’s attachments is invalid.');
    if (fileUrls.has(descriptor.url)) continue;
    const id = mediaIdFromUrl(descriptor.url); const media = id ? await getMedia(id, ownerId) : null;
    if (!media?.ready) throw new PlatformError('An attachment is missing. Upload it again before sending.');
    if (files.length >= 10) throw new PlatformError('Discord allows up to ten files per message.');
    requestBytes += media.size + 1024;
    if (requestBytes > 25 * 1024 * 1024) throw new PlatformError('All files and message content together must fit within Discord’s 25 MiB request limit.', 413);
    const name = `${files.length + 1}-${media.name}`.slice(0, 255);
    files.push({ name, bytes: await mediaBytes(media), contentType: media.type });
    fileUrls.set(descriptor.url, `attachment://${name}`);
  }
  const replace = (value: unknown): unknown => Array.isArray(value) ? value.map(replace) : plain(value)
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'url' && typeof item === 'string' && fileUrls.has(item) ? fileUrls.get(item) : replace(item)])) : value;
  let result = sanitizeBotMessagePayload(appendActionRows(replace(body) as Record<string, unknown>, actions.filter(action => action !== null)));
  const client = botClient();
  const [channel, channels, roles, current] = await Promise.all([client.channel(channelId), client.channels(guildId), client.roles(guildId), client.currentUser()]);
  if (channel.guild_id !== guildId) throw new PlatformError('This channel belongs to a different server.', 403);
  const member = await client.member(guildId, current.id);
  // Thread overwrites are inherited from the parent channel.
  const effective = [10, 11, 12].includes(channel.type) ? { ...channel, permission_overwrites: channels.find(parent => parent.id === channel.parent_id)?.permission_overwrites } : channel;
  try {
    assertCanSendChannel(guildId, member, roles, effective, Array.isArray(body.embeds) && body.embeds.length > 0, files.length > 0);
    for (const action of actions) if (action?.type === 'role') assertSelfRolePermissions(guildId, member, roles, action.roleIds || [], channels);
    if (!options.editMessageId && result.tts && !hasPermission(channelPermissions(guildId, member, roles, effective), PERMISSIONS.SEND_TTS_MESSAGES)) throw new Error('The bot needs the Send TTS Messages permission in this channel to send this message.');
  } catch (error) { throw new PlatformError((error as Error).message, 403); }
  if (options.editMessageId) {
    const previous = await client.message(channelId, options.editMessageId);
    if (previous.channel_id !== channelId || previous.author.id !== current.id) throw new PlatformError('This sent message does not belong to Meowhook in this channel.', 403);
    try { result = botEditPayload(result, previous.flags ?? 0); }
    catch (error) { throw new PlatformError((error as Error).message, 409); }
  }
  return { client, payload: result, files, editMessageId: options.editMessageId };
}

export async function deliverPrepared(delivery: Awaited<ReturnType<typeof prepareDelivery>>, channelId: string, options: { nonce?: string; editMessageId?: string } = {}) {
  const { client, payload, files } = delivery;
  if (options.editMessageId) {
    if (delivery.editMessageId !== options.editMessageId) throw new PlatformError('This edit has not been prepared for the chosen Discord message.', 409);
    return files.length ? client.editMessageWithFiles(channelId, options.editMessageId, payload, files) : client.editMessage(channelId, options.editMessageId, payload);
  }
  return files.length ? client.createMessageWithFiles(channelId, payload, files, options.nonce) : client.createMessage(channelId, payload, options.nonce);
}
export function scheduledError(error: unknown): ScheduledDeliveryError {
  if (error instanceof PlatformError) return new ScheduledDeliveryError('rejected', error.message);
  if (error instanceof DiscordRestError) return new ScheduledDeliveryError(error.status === 429 ? 'rate-limit' : error.status >= 500 ? 'uncertain' : 'rejected', error.message, error.retryAfterMs);
  return new ScheduledDeliveryError('uncertain', 'Discord did not confirm delivery. Check the channel before sending again.');
}
