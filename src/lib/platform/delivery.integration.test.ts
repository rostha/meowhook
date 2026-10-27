import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordRestError } from '@/lib/bot/rest';
import { botEditPayload, sanitizeBotMessagePayload } from '@/lib/bot/messagePayload';
import { getDatabase, migratePlatform } from './database';
import { PlatformRepository } from './repository';
import { prepareDelivery } from './delivery';
import { validateDispatch } from './validation';
import { POST } from '@/app/api/platform/messages/[id]/send/route';

const state = vi.hoisted(() => ({ allowed: true, user: 'alice', postStatus: 200, existingFlags: 0, foreignAuthor: false, failTransport: false, wait: undefined as Promise<void> | undefined }));
vi.mock('@/lib/platform/http', async importOriginal => {
  const actual = await importOriginal<typeof import('./http')>();
  return { ...actual, requireSession: vi.fn(async () => {
    if (!state.user) throw new actual.PlatformError('Sign in to continue.', 401);
    return { user: { id: state.user } };
  }) };
});
vi.mock('@/lib/platform/discord', async importOriginal => {
  const actual = await importOriginal<typeof import('./discord')>();
  const { PlatformError } = await import('./http');
  return { ...actual, requireGuild: vi.fn(async () => {
    if (!state.allowed) throw new PlatformError('You need Manage Server permission.', 403);
    return { id: '111111111111111111', botPresent: true };
  }) };
});

describe('Bot delivery and manual send with a persistent operation ledger', () => {
  const applicationId = '222222222222222222';
  const guildId = '111111111111111111';
  const channelId = '888888888888888888';
  const otherChannelId = '888888888888888887';
  const botUser = '444444444444444444';
  const messageId = '999999999999999999';
  let repository: PlatformRepository;
  let documentId = '';
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/users/@me')) return Response.json({ id: botUser });
    if (url.includes('/members/')) return Response.json({ user: { id: botUser }, roles: [] });
    if (url.endsWith(`/guilds/${guildId}/roles`)) return Response.json([{ id: guildId, name: '@everyone', position: 0, permissions: '52224' }]);
    if (url.endsWith(`/guilds/${guildId}/channels`)) return Response.json([]);
    if (url.endsWith(`/messages/${messageId}`) && init?.method === 'GET') return Response.json({ id: messageId, channel_id: channelId, author: { id: state.foreignAuthor ? '333333333333333333' : botUser }, flags: state.existingFlags });
    if (/\/channels\/\d+$/.test(url)) return Response.json({ id: url.split('/').at(-1), guild_id: guildId, type: 0 });
    if (init?.method === 'POST' || init?.method === 'PATCH') {
      if (state.wait) await state.wait;
      if (state.failTransport) throw new TypeError('Connection lost after upload');
      return state.postStatus === 200 ? Response.json({ id: messageId, channel_id: channelId }) : Response.json({ code: 50013, retry_after: 1 }, { status: state.postStatus });
    }
    throw new Error(`Unexpected test request: ${init?.method} ${url}`);
  });
  const mutations = () => fetcher.mock.calls.filter(([, init]) => init?.method === 'POST' || init?.method === 'PATCH');
  const send = (body: Record<string, unknown> = { requestId: 'test-operation' }, id = documentId, origin = 'https://meowhook.test') => POST(new Request(`https://meowhook.test/api/platform/messages/${id}/send`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('VERCEL', ''); vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('MEOWHOOK_LOCAL_DATABASE', ':memory:');
    vi.stubEnv('DISCORD_APPLICATION_ID', applicationId); vi.stubEnv('DISCORD_BOT_TOKEN', 'not-a-live-token'); vi.stubEnv('DISCORD_PUBLIC_KEY', 'f'.repeat(64));
    vi.stubGlobal('fetch', fetcher);
    await migratePlatform(getDatabase()); repository = new PlatformRepository();
  });
  beforeEach(async () => {
    await getDatabase().deleteFrom('platform_resource').execute(); await getDatabase().deleteFrom('platform_event').execute();
    Object.assign(state, { allowed: true, user: 'alice', postStatus: 200, existingFlags: 0, foreignAuthor: false, failTransport: false, wait: undefined }); fetcher.mockClear();
    documentId = (await repository.put('messages', 'alice', { name: 'Announcement', guildId, channelId, actionIds: [], payload: { content: 'Hello @everyone', flags: 64 | 4096, username: 'Impersonation', allowed_mentions: { parse: ['everyone'] } } })).id;
  });
  afterAll(async () => { await getDatabase().destroy(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('sends once, stores the receipt and reuses it without a second Discord mutation', async () => {
    const first = await send(); expect(first.status).toBe(200);
    const receipt = await first.json(); expect(receipt).toMatchObject({ status: 'sent', messageId, guildId, channelId, mode: 'send' });
    const second = await send(); expect(second.status).toBe(200); expect(await second.json()).toEqual(receipt);
    expect(mutations()).toHaveLength(1);
    const payload = JSON.parse(String(mutations()[0][1]?.body));
    expect(payload.flags).toBe(4096); expect(payload.username).toBeUndefined(); expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.enforce_nonce).toBe(true); expect(payload.nonce).toHaveLength(24);
    expect(await repository.get('messages', 'alice', documentId)).toMatchObject({ lastMessageId: messageId, lastChannelId: channelId });
  });

  it('binds a request ID to document, target and operation', async () => {
    expect((await send()).status).toBe(200);
    expect((await send({ requestId: 'test-operation', channelId: otherChannelId })).status).toBe(409);
    expect((await send({ requestId: 'test-operation', mode: 'edit' })).status).toBe(409);
    const second = await repository.put('messages', 'alice', { name: 'Second', guildId, channelId, actionIds: [], payload: { content: 'Second' } });
    expect((await send({ requestId: 'test-operation' }, second.id)).status).toBe(409);
    expect(mutations()).toHaveLength(1);
  });

  it('claims concurrent retries atomically before the Discord POST', async () => {
    let release!: () => void; state.wait = new Promise(resolve => { release = resolve; });
    const first = send();
    await vi.waitFor(() => expect(mutations()).toHaveLength(1));
    const concurrent = await send(); expect(concurrent.status).toBe(409);
    release(); expect((await first).status).toBe(200);
    expect((await send()).status).toBe(200); expect(mutations()).toHaveLength(1);
  });

  it('denies cross-account, cross-origin, revoked guild, and anonymous sends before mutation', async () => {
    state.user = 'bob'; expect((await send()).status).toBe(404);
    state.user = 'alice'; expect((await send({}, documentId, 'https://attacker.test')).status).toBe(403);
    state.allowed = false; expect((await send()).status).toBe(403);
    state.user = ''; expect((await send()).status).toBe(401);
    expect(mutations()).toHaveLength(0);
  });

  it('requires an idempotency ID and a valid operation', async () => {
    expect((await send({})).status).toBe(400);
    expect((await send({ requestId: 'operation', mode: 'typo' })).status).toBe(400);
    expect(mutations()).toHaveLength(0);
  });

  it('allows safe retries after explicit rejection but blocks ambiguous transport retries', async () => {
    state.postStatus = 429; expect((await send()).status).toBe(429);
    state.postStatus = 200; expect((await send()).status).toBe(200); expect(mutations()).toHaveLength(2);
    state.failTransport = true; expect((await send({ requestId: 'ambiguous' })).status).toBe(500);
    state.failTransport = false; expect((await send({ requestId: 'ambiguous' })).status).toBe(409); expect(mutations()).toHaveLength(3);
  });

  it('fetches the original before edits, clears removed data, and enforces irreversible V2 mode', async () => {
    const initial = await repository.get('messages', 'alice', documentId);
    await repository.put('messages', 'alice', { ...initial!, lastMessageId: messageId, lastChannelId: channelId, payload: { content: 'Replacement' } }, initial!);
    expect((await send({ requestId: 'edit-copy', mode: 'edit' })).status).toBe(200);
    const patch = JSON.parse(String(mutations()[0][1]?.body));
    expect(patch).toMatchObject({ content: 'Replacement', embeds: [], components: [], attachments: [], flags: 0, allowed_mentions: { parse: [] } });
    state.existingFlags = 32768;
    expect((await send({ requestId: 'cannot-revert', mode: 'edit' })).status).toBe(409);
    expect(mutations()).toHaveLength(1);
    state.existingFlags = 0; state.foreignAuthor = true;
    expect((await send({ requestId: 'wrong-author', mode: 'edit' })).status).toBe(403);
    expect(mutations()).toHaveLength(1);
  });

  it('prepares classic-to-V2 edits with all incompatible content reset', async () => {
    const delivery = await prepareDelivery('alice', guildId, channelId, { flags: 32768, components: [{ type: 10, content: 'V2 replacement' }] }, [], { editMessageId: messageId });
    expect(delivery.payload).toMatchObject({ content: null, embeds: [], poll: null, sticker_ids: [], components: [{ type: 10, content: 'V2 replacement' }], flags: 32768 });
  });

  it('allows complete V2 action-only messages but still rejects an empty text block', async () => {
    const action = await repository.put('actions', 'alice', { botId: applicationId, guildId, type: 'reply', label: 'Read rules', style: 2, response: 'Community rules', enabled: true });
    expect(validateDispatch({ flags: 32768, components: [] }, true)).toBeNull();
    expect(validateDispatch({ flags: 32768, components: [] }, false)).toContain('add a component');
    expect(validateDispatch({ flags: 32768, components: [{ type: 10, content: '' }] }, true)).toContain('add text');
    const prepared = await prepareDelivery('alice', guildId, channelId, { flags: 32768, components: [] }, [action.id]);
    expect(prepared.payload).toMatchObject({ flags: 32768, components: [{ type: 1, components: [{ type: 2, custom_id: `mh:action:${action.id}` }] }] });
  });
});

describe('Bot payload safety primitives', () => {
  it('masks interaction-only flags and webhook fields without enabling mentions', () => {
    expect(sanitizeBotMessagePayload({ flags: 4 | 64 | 4096 | 8192, content: 'Hello', username: 'Other', allowed_mentions: { parse: ['everyone'] }, nonce: 'untrusted' })).toEqual({ flags: 4 | 4096, content: 'Hello', allowed_mentions: { parse: [] } });
    expect(sanitizeBotMessagePayload({ flags: 32768 | 64, content: 'Wrong', embeds: [{}], components: [] })).toEqual({ flags: 32768, components: [], allowed_mentions: { parse: [] } });
  });
  it('preserves unmodifiable existing flag bits while editing allowed flags', () => {
    expect(botEditPayload({ content: 'Hi', flags: 4 | 4096 }, 4096)).toMatchObject({ flags: 4 | 4096 });
    expect(() => botEditPayload({ content: 'Back to normal' }, 32768)).toThrow('cannot turn');
    expect(new DiscordRestError(429, 20028, 1000).retryAfterMs).toBe(1000);
  });
});
