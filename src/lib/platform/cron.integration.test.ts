import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabase, migratePlatform } from './database';
import { PlatformRepository } from './repository';
import { GET } from '@/app/api/cron/schedules/route';

const state = vi.hoisted(() => ({ access: 'allowed', postStatus: 200 }));
vi.mock('@/lib/auth', () => ({ getAuth: vi.fn(async () => ({})) }));
vi.mock('@/lib/platform/discord', async importOriginal => {
  const actual = await importOriginal<typeof import('./discord')>();
  const { PlatformError } = await import('./http');
  return { ...actual, requireBackgroundGuild: vi.fn(async () => {
    if (state.access === 'revoked') throw new PlatformError('Manage Server permission was revoked.', 403);
    if (state.access === 'offline') throw new TypeError('Temporary network outage');
    if (state.access === 'limited') throw new PlatformError('Discord server access is temporarily rate limited.', 429);
  }) };
});

describe('Authenticated cron dispatch with SQL leases', () => {
  const guildId = '111111111111111111', channelId = '888888888888888888', botId = '222222222222222222';
  let repository: PlatformRepository;
  let id = '';
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/users/@me')) return Response.json({ id: botId });
    if (url.includes('/members/')) return Response.json({ user: { id: botId }, roles: [] });
    if (url.endsWith('/roles')) return Response.json([{ id: guildId, name: '@everyone', position: 0, permissions: '3072' }]);
    if (url.endsWith(`/guilds/${guildId}/channels`)) return Response.json([]);
    if (url.endsWith(`/channels/${channelId}`)) return Response.json({ id: channelId, guild_id: guildId, type: 0 });
    if (url.endsWith('/messages') && init?.method === 'POST') return state.postStatus === 200
      ? Response.json({ id: '999999999999999999', channel_id: channelId })
      : Response.json({ retry_after: 1 }, { status: state.postStatus });
    throw new Error(`Unexpected test request: ${url}`);
  });
  const run = (authorization = 'Bearer test-cron-secret') => GET(new Request('https://meowhook.test/api/cron/schedules', { headers: { Authorization: authorization } }));
  const sends = () => fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('VERCEL', ''); vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('MEOWHOOK_LOCAL_DATABASE', ':memory:');
    vi.stubEnv('DISCORD_APPLICATION_ID', botId); vi.stubEnv('DISCORD_BOT_TOKEN', 'test-token'); vi.stubEnv('DISCORD_PUBLIC_KEY', 'f'.repeat(64)); vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    vi.stubGlobal('fetch', fetcher); await migratePlatform(getDatabase()); repository = new PlatformRepository();
  });
  beforeEach(async () => {
    await getDatabase().deleteFrom('platform_schedule').execute(); fetcher.mockClear(); state.access = 'allowed'; state.postStatus = 200;
    const due = new Date(Date.now() - 60_000).toISOString();
    id = (await repository.put('schedules', 'alice', { messageId: 'saved-message', guildId, channelId, payload: { content: 'Scheduled hello' }, actionIds: [],
      rule: { frequency: 'once', timezone: 'UTC', localTime: '00:00', startsAt: due }, nextRunAt: due, status: 'active', attempts: 0 })).id;
  });
  afterAll(async () => { await getDatabase().destroy(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('rejects unauthenticated cron calls without claiming or dispatching work', async () => {
    expect((await run('')).status).toBe(401); expect((await run('Bearer incorrect-secret')).status).toBe(401);
    expect(sends()).toHaveLength(0); expect((await repository.get('schedules', 'alice', id))?.status).toBe('active');
  });
  it('delivers a due job once and records the receipt in its account', async () => {
    const response = await run(); expect(response.status).toBe(200);
    expect((await response.json()).results).toMatchObject([{ scheduleId: id, status: 'sent', messageId: '999999999999999999' }]);
    expect((await repository.get('schedules', 'alice', id))).toMatchObject({ status: 'completed', lastMessageId: '999999999999999999' });
    expect((await repository.get('schedules', 'bob', id))).toBeNull();
    expect((await (await run()).json()).results).toEqual([]); expect(sends()).toHaveLength(1);
    expect(JSON.parse(String(sends()[0][1]?.body))).toMatchObject({ enforce_nonce: true, allowed_mentions: { parse: [] } });
  });
  it('blocks revoked access but retries a transient preflight outage before POST', async () => {
    state.access = 'offline';
    expect((await (await run()).json()).results).toMatchObject([{ status: 'retrying' }]);
    expect((await repository.get('schedules', 'alice', id))).toMatchObject({ status: 'active', attempts: 1 }); expect(sends()).toHaveLength(0);
    state.access = 'revoked'; await getDatabase().updateTable('platform_schedule').set({ next_run_at: new Date(Date.now() - 1000).toISOString() }).where('id', '=', id).execute();
    expect((await (await run()).json()).results).toMatchObject([{ status: 'failed' }]);
    expect((await repository.get('schedules', 'alice', id))).toMatchObject({ status: 'failed', lastErrorKind: 'rejected' }); expect(sends()).toHaveLength(0);
  });
  it('retries confirmed rate limits with the same occurrence nonce', async () => {
    state.postStatus = 429; expect((await (await run()).json()).results).toMatchObject([{ status: 'retrying' }]);
    state.postStatus = 200; await getDatabase().updateTable('platform_schedule').set({ next_run_at: new Date(Date.now() - 1000).toISOString() }).where('id', '=', id).execute();
    expect((await (await run()).json()).results).toMatchObject([{ status: 'sent' }]);
    const nonces = sends().map(([, init]) => JSON.parse(String(init?.body)).nonce);
    expect(nonces).toHaveLength(2); expect(nonces[0]).toBe(nonces[1]);
  });
  it('retries an OAuth permission-check rate limit without permanently failing the schedule', async () => {
    state.access = 'limited';
    expect((await (await run()).json()).results).toMatchObject([{ status: 'retrying' }]);
    expect(await repository.get('schedules', 'alice', id)).toMatchObject({ status: 'active', attempts: 1, lastError: expect.stringContaining('rate limited') });
    expect(fetcher).not.toHaveBeenCalled();
    state.access = 'allowed';
    await getDatabase().updateTable('platform_schedule').set({ next_run_at: new Date(Date.now() - 1000).toISOString() }).where('id', '=', id).execute();
    expect((await (await run()).json()).results).toMatchObject([{ status: 'sent' }]);
    expect(await repository.get('schedules', 'alice', id)).toMatchObject({ status: 'completed', attempts: 2 });
    expect(sends()).toHaveLength(1);
  });
});
