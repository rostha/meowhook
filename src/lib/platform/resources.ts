import { PlatformRepository } from './repository';
import { discordId, normalizeResource } from './validation';
import { requireGuild, botClient } from './discord';
import { PlatformError } from './http';
import { platformStatus } from './config';
import { assertSelfRolePermissions } from '@/lib/bot/permissions';
import { validateScheduleRule, requireNextScheduleRun, transitionSchedule, ScheduleValidationError } from '@/lib/scheduling/timing';
import type { ResourceMap, ResourceName, SavedAction, SavedCommand, SavedForm, SavedMessage } from './types';
import { getMedia } from './media';

export async function saveResource(kind: ResourceName, ownerId: string, body: Record<string, unknown>, headers: Headers, existing?: ResourceMap[ResourceName]) {
  const repository = new PlatformRepository();
  if (kind === 'responses') throw new PlatformError('Form responses are read only.', 405);
  if (existing && body.revision !== undefined && body.revision !== existing.revision) throw new PlatformError('This item changed in another tab. Refresh and try again.', 409);
  let fields: Record<string, unknown>;
  let requireUnleased = false;
  let unchanged = false;
  if (kind === 'schedules') {
    try {
      if (existing) {
        const job = existing as ResourceMap['schedules'];
        if (body.action !== undefined) {
          if (!['pause', 'resume', 'cancel'].includes(String(body.action))) throw new PlatformError('Choose pause, resume or cancel.');
          fields = transitionSchedule(job, body.action as 'pause' | 'resume' | 'cancel') as unknown as Record<string, unknown>;
          requireUnleased = body.action === 'resume';
        } else {
          const rule = validateScheduleRule(body.rule ?? job.rule);
          const messageId = body.messageId === undefined ? job.messageId : String(body.messageId);
          const guildId = body.guildId === undefined ? job.guildId : discordId(body.guildId, 'server', false);
          const channelId = body.channelId === undefined ? job.channelId : discordId(body.channelId, 'channel', false);
          const status = body.status === undefined ? job.status : String(body.status);
          const contentChanged = messageId !== job.messageId || guildId !== job.guildId || channelId !== job.channelId || JSON.stringify(rule) !== JSON.stringify(validateScheduleRule(job.rule));
          if (!contentChanged) {
            if (status === job.status) { fields = { ...job }; unchanged = true; }
            else {
              const action = ({ paused: 'pause', active: 'resume', cancelled: 'cancel' } as const)[status as 'paused' | 'active' | 'cancelled'];
              if (!action) throw new PlatformError('Choose an active, paused or cancelled schedule.');
              fields = transitionSchedule(job, action) as unknown as Record<string, unknown>;
              requireUnleased = action === 'resume';
            }
          } else {
            if (!['active', 'paused'].includes(job.status) || job.lastErrorKind === 'uncertain') throw new PlatformError('Check the previous delivery and create a new schedule to send again.', 409);
            if (!['active', 'paused'].includes(status)) throw new PlatformError('Choose active or paused for an edited schedule.');
            const message = await repository.get('messages', ownerId, messageId);
            if (!message) throw new PlatformError('Choose a saved message first.');
            fields = { ...job, messageId: message.id, guildId, channelId, payload: message.payload, actionIds: message.actionIds,
              rule, nextRunAt: requireNextScheduleRun(rule), status, attempts: 0, lastError: undefined, lastErrorKind: undefined };
            requireUnleased = true;
          }
        }
      } else {
        const message = await repository.get('messages', ownerId, String(body.messageId));
        if (!message) throw new PlatformError('Choose a saved message first.');
        const rule = validateScheduleRule(body.rule);
        const status = body.status === undefined ? 'active' : String(body.status);
        if (!['active', 'paused'].includes(status)) throw new PlatformError('Choose active or paused for a new schedule.');
        fields = { messageId: message.id, guildId: body.guildId || message.guildId, channelId: body.channelId || message.channelId,
          payload: message.payload, actionIds: message.actionIds, rule, nextRunAt: requireNextScheduleRun(rule), status, attempts: 0 };
        if (!fields.guildId || !fields.channelId) throw new PlatformError('Choose a server and channel for this schedule.');
      }
      // Owners must be able to stop a job even after losing server access or when
      // a referenced action was removed. Stopping never authorizes a Discord send.
      if (unchanged && existing) return existing;
      if (existing && !requireUnleased && ['paused', 'cancelled'].includes(String(fields.status))) {
        return repository.put(kind, ownerId, fields, existing as never);
      }
      const { validateDispatch } = await import('./validation');
      const issue = validateDispatch(fields.payload as Record<string, unknown>, (fields.actionIds as string[]).length > 0);
      if (issue) throw new PlatformError(issue);
    } catch (error) { if (error instanceof ScheduleValidationError) throw new PlatformError(error.message); throw error; }
  } else {
    try { fields = normalizeResource(kind, body, existing?.id); }
    catch (error) { if (error instanceof PlatformError) throw error; throw new PlatformError('Some fields are invalid. Check the form and try again.'); }
  }
  const guildId = discordId(fields.guildId, 'server', kind !== 'schedules');
  if ('channelId' in fields) fields.channelId = discordId(fields.channelId, 'channel', kind !== 'schedules');
  if (guildId) {
    const guild = await requireGuild(headers, guildId);
    if (guild.botPresent && platformStatus().botConfigured) {
      // Channel IDs are not an authorization boundary. A valid-looking ID may belong
      // to a different server that this account does not manage.
      const channelIds = [...new Set([fields.channelId, fields.responseChannelId].filter((id): id is string => typeof id === 'string' && Boolean(id)))];
      const channels = await Promise.all(channelIds.map(id => botClient().channel(id)));
      if (channels.some(channel => channel.guild_id !== guildId || ![0, 5, 10, 11, 12].includes(channel.type))) {
        throw new PlatformError('Choose a message channel from this server.');
      }
    }
  }
  if (kind === 'messages') {
    const document = fields.editorMessage as import('@/lib/types').Message;
    for (const attachment of document._attachments || []) {
      if (!attachment.platformMediaId) throw new PlatformError('Upload attached files before saving this message.');
      const media = await getMedia(attachment.platformMediaId, ownerId);
      if (!media?.ready) throw new PlatformError('An uploaded file is unavailable or belongs to another account.');
    }
  }
  // Validate references against both ownership and server. Guessing IDs cannot share another account's config.
  const reference = async (resource: 'forms' | 'actions', id: unknown) => {
    if (!id) return;
    const item = await repository.get(resource, ownerId, String(id));
    if (!item || item.guildId !== guildId) throw new PlatformError('Choose a saved item from this account and server.');
  };
  if (kind === 'actions') await reference('forms', fields.formId);
  if (kind === 'commands') { await reference('forms', fields.formId); await reference('actions', fields.actionId); }
  for (const id of (fields.actionIds || []) as string[]) await reference('actions', id);
  if (guildId && kind === 'actions' && fields.type === 'role' && platformStatus().botConfigured) {
    const client = botClient();
    const [user, roles, channels] = await Promise.all([client.currentUser(), client.roles(guildId), client.channels(guildId)]);
    const member = await client.member(guildId, user.id);
    try { assertSelfRolePermissions(guildId, member, roles, fields.roleIds as string[], channels); }
    catch (error) { throw new PlatformError((error as Error).message); }
  }
  if (kind === 'commands') {
    const rows = await repository.db.selectFrom('platform_resource').select(['id', 'data']).where('kind', '=', 'commands').where('guild_id', '=', guildId).execute();
    if (rows.some(row => { const command = JSON.parse(row.data) as SavedCommand; return row.id !== existing?.id && command.name === fields.name && command.type === fields.type && (guildId || command.ownerId === ownerId); })) {
      throw new PlatformError('A command with this name and type already exists in this server.', 409);
    }
  }
  if (unchanged && existing) return existing;
  const item = await repository.put(kind, ownerId, fields, existing as never, { requireUnleased });
  return item;
}

export async function assertNoReferences(repository: PlatformRepository, kind: ResourceName, ownerId: string, id: string) {
  if (kind === 'forms') {
    const [actions, commands] = await Promise.all([repository.list('actions', ownerId), repository.list('commands', ownerId)]);
    if ([...actions, ...commands].some(item => item.formId === id)) throw new PlatformError('Remove this form from its actions and commands first.', 409);
  }
  if (kind === 'actions') {
    const [messages, schedules, commands] = await Promise.all([repository.list('messages', ownerId), repository.list('schedules', ownerId), repository.list('commands', ownerId)]);
    if (messages.some(item => item.actionIds.includes(id)) || schedules.some(item => item.actionIds.includes(id) && ['active', 'paused'].includes(item.status)) || commands.some(item => item.actionId === id)) throw new PlatformError('Remove this action from its messages, schedules and commands first.', 409);
  }
}
