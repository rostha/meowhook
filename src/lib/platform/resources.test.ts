import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabase, migratePlatform, type Database } from './database';
import { PlatformRepository } from './repository';
import { assertNoReferences, saveResource } from './resources';
import { requireGuild, botClient } from './discord';
import { platformStatus } from './config';

vi.mock('./discord', () => ({ requireGuild: vi.fn(), botClient: vi.fn() }));
vi.mock('./config', () => ({ applicationId: () => '123456789012345678', platformStatus: vi.fn() }));
const guildId = '223456789012345678'; const channelId = '323456789012345678';
let db: Database; let repository: PlatformRepository;
const channel = vi.fn();
const message = () => ({ name: 'Announcement', guildId, channelId, actionIds: [], payload: { content: 'Hello' } });
beforeAll(async () => {
  vi.stubEnv('MEOWHOOK_LOCAL_DATABASE', ':memory:'); vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('NODE_ENV', 'test');
  db = getDatabase(); await migratePlatform(db); repository = new PlatformRepository(db);
});
beforeEach(async () => {
  await db.deleteFrom('platform_resource').execute(); await db.deleteFrom('platform_schedule').execute();
  vi.mocked(platformStatus).mockReturnValue({ authAvailable: true, botConfigured: true, discordLogin: true, discordConfigured: true, schedulerConfigured: true });
  vi.mocked(requireGuild).mockResolvedValue({ id: guildId, name: 'Server', icon: null, botPresent: true, permissions: '32' });
  channel.mockReset().mockResolvedValue({ id: channelId, guild_id: guildId, type: 0 });
  vi.mocked(botClient).mockReturnValue({ channel } as unknown as ReturnType<typeof botClient>);
});
afterAll(async () => { await db.destroy(); vi.unstubAllEnvs(); });

describe('resource server boundaries and references', () => {
  it('saves a message into a valid channel of the authorized server', async () => {
    const saved = await saveResource('messages', 'owner', message(), new Headers());
    expect(saved).toMatchObject({ ownerId: 'owner', guildId, channelId });
    expect(channel).toHaveBeenCalledWith(channelId);
  });
  it.each([{ guild_id: '423456789012345678', type: 0 }, { guild_id: guildId, type: 4 }, { type: 1 }])('rejects a foreign, category or DM destination %j', async destination => {
    channel.mockResolvedValue({ id: channelId, ...destination });
    await expect(saveResource('messages', 'owner', message(), new Headers())).rejects.toMatchObject({ status: 400 });
    expect(await repository.list('messages', 'owner')).toEqual([]);
  });
  it('validates form notification channels against the same server', async () => {
    channel.mockResolvedValue({ id: channelId, guild_id: '423456789012345678', type: 0 });
    await expect(saveResource('forms', 'owner', { guildId, title: 'Contact', fields: [{ id: 'reason', label: 'Reason', type: 'short', required: true }],
      responseChannelId: channelId, confirmation: 'Saved', enabled: true }, new Headers())).rejects.toThrow('this server');
  });
  it('allows building valid IDs before the bot is installed without pretending to validate Discord', async () => {
    vi.mocked(requireGuild).mockResolvedValue({ id: guildId, name: 'Server', icon: null, botPresent: false, permissions: '32' });
    await expect(saveResource('messages', 'owner', message(), new Headers())).resolves.toMatchObject({ guildId, channelId });
    expect(channel).not.toHaveBeenCalled();
  });
  it('rejects malformed scheduled channel IDs before dispatch', async () => {
    const saved = await repository.put('messages', 'owner', { ...message(), payload: { content: 'Hello' } });
    await expect(saveResource('schedules', 'owner', { messageId: saved.id, guildId, channelId: 'not-an-id',
      rule: { frequency: 'once', timezone: 'UTC', localTime: '09:00', startsAt: '2030-10-26T09:00:00.000Z' } }, new Headers())).rejects.toThrow('channel');
  });
  it('refuses another account or another server form reference', async () => {
    const form = await repository.put('forms', 'other-account', { guildId, botId: '123456789012345678', title: 'Private form', enabled: true });
    const action = { type: 'form', formId: form.id, guildId, label: 'Open', style: 1, enabled: true };
    await expect(saveResource('actions', 'owner', action, new Headers())).rejects.toThrow('this account and server');
    const foreignForm = await repository.put('forms', 'owner', { guildId: '423456789012345678', botId: '123456789012345678', title: 'Foreign form', enabled: true });
    await expect(saveResource('actions', 'owner', { ...action, formId: foreignForm.id }, new Headers())).rejects.toThrow('this account and server');
  });
  it('protects actions referenced by paused schedules until they are cancelled', async () => {
    const action = await repository.put('actions', 'owner', { guildId, type: 'reply', botId: '123456789012345678', label: 'Help', style: 1, response: 'Hello', enabled: true });
    const schedule = await repository.put('schedules', 'owner', { guildId, channelId, messageId: 'snapshot-source', payload: { content: 'Hello' }, actionIds: [action.id], status: 'paused', nextRunAt: '2030-10-26T09:00:00.000Z',
      attempts: 0, rule: { frequency: 'once', timezone: 'UTC', localTime: '09:00', startsAt: '2030-10-26T09:00:00.000Z' } });
    await expect(assertNoReferences(repository, 'actions', 'owner', action.id)).rejects.toMatchObject({ status: 409 });
    await repository.put('schedules', 'owner', { ...schedule, status: 'cancelled' }, schedule);
    await expect(assertNoReferences(repository, 'actions', 'owner', action.id)).resolves.toBeUndefined();
  });
  it('creates paused schedules and saves an unchanged active schedule without treating it as Resume', async () => {
    const source = await repository.put('messages', 'owner', { ...message(), payload: { content: 'Snapshot' } });
    const rule = { frequency: 'once', timezone: 'UTC', localTime: '09:00', startsAt: '2030-10-26T09:00:00.000Z' };
    const paused = await saveResource('schedules', 'owner', { messageId: source.id, guildId, channelId, rule, status: 'paused' }, new Headers());
    expect(paused).toMatchObject({ status: 'paused', payload: { content: 'Snapshot' } });
    const active = await saveResource('schedules', 'owner', { messageId: source.id, guildId, channelId, rule, status: 'active' }, new Headers());
    const unchanged = await saveResource('schedules', 'owner', { ...active }, new Headers(), active);
    expect(unchanged).toBe(active); expect(unchanged.revision).toBe(1);
  });
  it('edits a future rule with a new immutable payload snapshot', async () => {
    const source = await repository.put('messages', 'owner', { ...message(), payload: { content: 'First snapshot' } });
    const rule = { frequency: 'once', timezone: 'UTC', localTime: '09:00', startsAt: '2030-10-26T09:00:00.000Z' };
    const saved = await saveResource('schedules', 'owner', { messageId: source.id, guildId, channelId, rule }, new Headers());
    await repository.put('messages', 'owner', { ...source, payload: { content: 'Snapshot at intentional schedule edit' } }, source);
    await db.updateTable('platform_schedule').set({ occurrence_id: 'old-safe-retry', scheduled_for: rule.startsAt, attempt: 4 }).where('id', '=', saved.id).execute();
    const updated = await saveResource('schedules', 'owner', { ...saved, rule: { ...rule, startsAt: '2031-10-26T09:00:00.000Z' } }, new Headers(), saved);
    expect(updated).toMatchObject({ status: 'active', nextRunAt: '2031-10-26T09:00:00.000Z', payload: { content: 'Snapshot at intentional schedule edit' }, revision: 2 });
    const row = await db.selectFrom('platform_schedule').selectAll().where('id', '=', saved.id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ occurrence_id: null, scheduled_for: null, attempt: 0 });
    const currentSource = (await repository.get('messages', 'owner', source.id))!;
    await repository.put('messages', 'owner', { ...currentSource, payload: { content: 'Later edit must stay separate' } }, currentSource);
    expect((await repository.get('schedules', 'owner', updated.id))!.payload).toEqual({ content: 'Snapshot at intentional schedule edit' });
  });
  it('blocks in-flight content/rule edits atomically while permitting pause or cancel', async () => {
    const source = await repository.put('messages', 'owner', { ...message(), payload: { content: 'Snapshot' } });
    const rule = { frequency: 'once', timezone: 'UTC', localTime: '09:00', startsAt: '2030-10-26T09:00:00.000Z' };
    const saved = await saveResource('schedules', 'owner', { messageId: source.id, guildId, channelId, rule }, new Headers());
    await db.updateTable('platform_schedule').set({ lease_token: 'worker-lease', lease_until: '2030-10-26T09:02:00.000Z', phase: 'sending' }).where('id', '=', saved.id).execute();
    await expect(saveResource('schedules', 'owner', { ...saved, rule: { ...rule, startsAt: '2031-10-26T09:00:00.000Z' } }, new Headers(), saved)).rejects.toMatchObject({ status: 409 });
    vi.mocked(requireGuild).mockRejectedValue(new Error('Server access revoked'));
    const paused = await saveResource('schedules', 'owner', { action: 'pause' }, new Headers(), saved);
    expect(paused).toMatchObject({ status: 'paused' });
    const cancelled = await saveResource('schedules', 'owner', { action: 'cancel' }, new Headers(), paused);
    expect(cancelled).toMatchObject({ status: 'cancelled' });
  });
  it('never reactivates an uncertain delivery by editing its fields', async () => {
    const source = await repository.put('messages', 'owner', { ...message(), payload: { content: 'Snapshot' } });
    const rule = { frequency: 'once', timezone: 'UTC', localTime: '09:00', startsAt: '2030-10-26T09:00:00.000Z' };
    const failed = await repository.put('schedules', 'owner', { messageId: source.id, guildId, channelId, rule, payload: { content: 'May already exist' }, actionIds: [],
      nextRunAt: rule.startsAt, status: 'failed', lastErrorKind: 'uncertain', attempts: 1 });
    await expect(saveResource('schedules', 'owner', { ...failed, status: 'active', rule: { ...rule, startsAt: '2031-10-26T09:00:00.000Z' } }, new Headers(), failed)).rejects.toMatchObject({ status: 409 });
  });
  it('rejects a self-role with moderation powers granted only by channel overwrites', async () => {
    const botRole = '523456789012345678'; const selfRole = '623456789012345678'; const botId = '723456789012345678';
    vi.mocked(botClient).mockReturnValue({ channel,
      currentUser: vi.fn().mockResolvedValue({ id: botId }), member: vi.fn().mockResolvedValue({ user: { id: botId }, roles: [botRole] }),
      roles: vi.fn().mockResolvedValue([{ id: guildId, name: '@everyone', position: 0, permissions: '0' },
        { id: botRole, name: 'Bot', position: 5, permissions: '268435456' }, { id: selfRole, name: 'Member', position: 1, permissions: '0' }]),
      channels: vi.fn().mockResolvedValue([{ id: channelId, guild_id: guildId, type: 0, permission_overwrites: [{ id: selfRole, type: 0, allow: '16', deny: '0' }] }]),
    } as unknown as ReturnType<typeof botClient>);
    await expect(saveResource('actions', 'owner', { guildId, type: 'role', label: 'Member', style: 1, enabled: true, roleIds: [selfRole], selection: 'buttons' }, new Headers())).rejects.toThrow('channel permissions');
  });
});
