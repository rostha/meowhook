import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuth } from '@/lib/auth';
import { getDatabase, type Database } from './database';
import { GET as list, POST as create } from '@/app/api/platform/[resource]/route';
import { GET as get, PATCH as update, DELETE as remove } from '@/app/api/platform/[resource]/[id]/route';
import { PlatformRepository } from './repository';
import { platformBotRepository } from './botRepository';
import { completeMedia, registerMedia } from './media';
import { validateDispatch } from './validation';
import { mockDiscordOAuth } from '@/lib/testing/discordOAuth';
import { GET as authGet, POST as authPost } from '@/app/api/auth/[...all]/route';
import { betterAuth } from 'better-auth';
import { createAuthOptions } from '@/lib/authOptions';
import { sql } from 'kysely';

const base = 'http://localhost:3000';
const appId = '123456789012345678';
const guildId = '223456789012345678';
let db: Database;
let auth: Awaited<ReturnType<typeof getAuth>>;
let first: { cookie: string; id: string };
let second: { cookie: string; id: string };
const oauth = mockDiscordOAuth(base);
const context = (resource = 'messages', id = '') => ({ params: Promise.resolve({ resource, id }) });
function request(method: string, cookie = '', body?: unknown, origin = base, resource = 'messages', id = '') {
  return new Request(`${base}/api/platform/${resource}${id ? '/' + id : ''}`, { method,
    headers: { ...(cookie ? { cookie } : {}), ...(method !== 'GET' ? { origin, 'content-type': 'application/json' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeAll(async () => {
  vi.stubEnv('MEOWHOOK_LOCAL_DATABASE', ':memory:'); vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('BETTER_AUTH_SECRET', 'A sufficiently long integration-test-only secret 1234567890');
  vi.stubEnv('BETTER_AUTH_URL', base); vi.stubEnv('DISCORD_APPLICATION_ID', appId);
  vi.stubEnv('DISCORD_CLIENT_ID', appId); vi.stubEnv('DISCORD_CLIENT_SECRET', 'test-only-discord-oauth-secret');
  vi.stubGlobal('fetch', oauth.fetch);
  auth = await getAuth(); db = getDatabase();
  first = await oauth.signIn(auth, '323456789012345678'); second = await oauth.signIn(auth, '423456789012345678');
});
beforeEach(async () => {
  await db.deleteFrom('platform_resource').execute(); await db.deleteFrom('platform_schedule').execute();
  // Each OAuth case owns a fresh transport window; separate happy-path cases must
  // not collectively exhaust the production ten-starts-per-minute protection.
  await sql`delete from "rateLimit"`.execute(db);
});
afterAll(async () => { await db.destroy(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('real account sessions and dashboard APIs', () => {
  it('completes Discord OAuth through the public start, callback and session route wrappers', async () => {
    const calls: Array<{ method: string; path: string; cookie: string }> = [];
    const routed = { handler: async (request: Request) => {
      calls.push({ method: request.method, path: new URL(request.url).pathname, cookie: request.headers.get('cookie') || '' });
      return request.method === 'POST' ? authPost(request) : authGet(request);
    } };
    const discordId = '343456789012345678';
    const signedIn = await oauth.signIn(routed, discordId, { username: 'public_member', global_name: 'Public Discord member' },
      { idToken: { token: 'forged-token' }, scopes: ['email'], additionalData: { discordId: '233456789012345678', discordUsername: 'forged' } });
    expect(calls.map(call => `${call.method} ${call.path}`)).toEqual([
      'POST /api/auth/sign-in/social', 'GET /api/auth/callback/discord', 'GET /api/auth/get-session',
    ]);
    expect(signedIn.stateCookie).toBeTruthy(); expect(calls[1].cookie).toBe(signedIn.stateCookie);
    expect(calls[2].cookie).toBe(signedIn.cookie); expect(signedIn.cookie).toContain('session_token=');
    expect(new Set(new URL(signedIn.authorizationUrl).searchParams.get('scope')?.split(' '))).toEqual(new Set(['identify', 'guilds']));
    const response = await authGet(new Request(`${base}/api/auth/get-session`, { headers: { cookie: signedIn.cookie } }));
    expect(response.status).toBe(200); const session = await response.json();
    expect(session.user).toMatchObject({ id: signedIn.id, discordId, discordUsername: 'public_member', name: 'Public Discord member' });
    expect(session.user).not.toHaveProperty('email');
    expect((await list(request('GET', signedIn.cookie), context())).status).toBe(200);
  });
  it('uses only Discord identity and server scopes and hides the internal email from the session response', async () => {
    const signedIn = await oauth.signIn(auth, '523456789012345678');
    const url = new URL(signedIn.authorizationUrl);
    expect(url.origin).toBe('https://discord.com');
    expect(new Set(url.searchParams.get('scope')?.split(' '))).toEqual(new Set(['identify', 'guilds']));
    expect(url.searchParams.get('client_id')).toBe(appId);
    expect(url.searchParams.get('state')).toBeTruthy();
    const response = await authGet(new Request(`${base}/api/auth/get-session`, { headers: { cookie: signedIn.cookie } }));
    const session = await response.json();
    expect(session.user).toMatchObject({ id: signedIn.id, discordId: '523456789012345678', discordUsername: 'member_523456789012345678' });
    expect(session.user).not.toHaveProperty('email');
  });
  it('updates the Discord profile without creating another user and never stores a password', async () => {
    const before = await oauth.signIn(auth, '623456789012345678', { username: 'before', global_name: 'Before' });
    const after = await oauth.signIn(auth, '623456789012345678', { username: 'after', global_name: 'After', avatar: 'new_avatar_hash' });
    expect(after.id).toBe(before.id);
    const session = await (await authGet(new Request(`${base}/api/auth/get-session`, { headers: { cookie: after.cookie } }))).json();
    expect(session.user).toMatchObject({ name: 'After', discordUsername: 'after', image: 'https://cdn.discordapp.com/avatars/623456789012345678/new_avatar_hash.png' });
    const account = await sql<{ password: string | null; accessToken: string }>`select password, "accessToken" from account where "userId" = ${after.id}`.execute(db);
    expect(account.rows).toHaveLength(1); expect(account.rows[0].password).toBeNull();
    expect(account.rows[0].accessToken).not.toContain('test-access-');
  });
  it('keeps separate Discord IDs separate even if profile emails match', async () => {
    const a = await oauth.signIn(auth, '723456789012345678', { email: 'same@example.test', verified: true });
    const b = await oauth.signIn(auth, '823456789012345678', { email: 'same@example.test', verified: true });
    expect(a.id).not.toBe(b.id);
  });
  it('takes profile identity from Discord even when OAuth request metadata attempts to spoof it', async () => {
    const signedIn = await oauth.signIn(auth, '133456789012345678', { username: 'real_username' }, { additionalData: { discordId: '233456789012345678', discordUsername: 'forged_username', email: 'forged@example.test' } });
    const response = await authGet(new Request(`${base}/api/auth/get-session`, { headers: { cookie: signedIn.cookie } }));
    expect((await response.json()).user).toMatchObject({ discordId: '133456789012345678', discordUsername: 'real_username' });
  });
  it('rejects an old credential-only session at both session and workspace endpoints', async () => {
    const legacy = betterAuth({ ...createAuthOptions({ db, type: 'sqlite', baseURL: base,
      secret: 'A sufficiently long integration-test-only secret 1234567890' }), disabledPaths: [], emailAndPassword: { enabled: true } });
    const response = await legacy.handler(new Request(`${base}/api/auth/sign-up/email`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Legacy account', email: 'legacy@example.test', password: 'Legacy fixture password 1234' }) }));
    expect(response.status).toBe(200);
    const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    expect((await (await legacy.handler(new Request(`${base}/api/auth/get-session`, { headers: { cookie } }))).json()).user).toBeTruthy();
    expect(await (await authGet(new Request(`${base}/api/auth/get-session`, { headers: { cookie } }))).json()).toBeNull();
    expect((await list(request('GET', cookie), context())).status).toBe(401);
  });
  it('rejects missing, forged, and replayed OAuth state without issuing a session', async () => {
    for (const query of ['code=forged', 'code=forged&state=forged']) {
      const response = await authGet(new Request(`${base}/api/auth/callback/discord?${query}`));
      expect(response.headers.get('location')).not.toBe(`${base}/dashboard`);
      expect(response.headers.getSetCookie().some(cookie => /session_token=.+?;/.test(cookie) && !cookie.includes('Max-Age=0'))).toBe(false);
    }
    const signedIn = await oauth.signIn(auth, '923456789012345678');
    const replay = await authGet(new Request(signedIn.callbackUrl, { headers: { cookie: signedIn.stateCookie } }));
    expect(new URL(replay.headers.get('location')!, base).pathname).not.toBe('/dashboard');
    expect(replay.headers.getSetCookie().some(cookie => /session_token=.+?;/.test(cookie) && !cookie.includes('Max-Age=0'))).toBe(false);
  });
  it('rejects cross-origin sign-in and external return URLs', async () => {
    const signin = (origin: string, callbackURL: string) => authPost(new Request(`${base}/api/auth/sign-in/social`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'discord', callbackURL }) }));
    expect((await signin('https://other.example', '/dashboard')).status).toBe(403);
    expect((await signin(base, 'https://other.example/steal')).status).toBe(403);
  });
  it.each(['callbackURL', 'errorCallbackURL', 'newUserCallbackURL'])('bounds every OAuth return address: %s', async key => {
    for (const value of ['https://other.example/return', '//other.example/return', 'javascript:alert(1)', `${base.replace('://', '://user:secret@')}/dashboard`]) {
      const response = await authPost(new Request(`${base}/api/auth/sign-in/social`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'discord', [key]: value }) }));
      expect(response.status).toBe(403); expect(response.headers.getSetCookie()).toEqual([]);
    }
    const invalid = await authPost(new Request(`${base}/api/auth/sign-in/social`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'discord', [key]: ['not-a-url'] }) }));
    expect(invalid.status).toBe(400);
  });
  it('rejects oversized OAuth JSON from declared length or streamed body size', async () => {
    for (const [body, contentLength] of [['{}', '16385'], [JSON.stringify({ provider: 'discord', callbackURL: '/' + 'x'.repeat(17_000) }), '1']]) {
      const response = await authPost(new Request(`${base}/api/auth/sign-in/social`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json', 'content-length': contentLength }, body }));
      expect(response.status).toBe(413); expect(response.headers.getSetCookie()).toEqual([]);
    }
  });
  it('rejects alternate providers and malformed OAuth bodies before creating state', async () => {
    for (const body of [{ provider: 'google' }, { provider: 'credential' }, {}, null, []]) {
      const response = await authPost(new Request(`${base}/api/auth/sign-in/social`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
      expect(response.status).toBe(400); expect(response.headers.getSetCookie()).toEqual([]);
    }
    const wrongType = await authPost(new Request(`${base}/api/auth/sign-in/social`, { method: 'POST', headers: { origin: base, 'content-type': 'text/plain' }, body: '{}' }));
    expect(wrongType.status).toBe(415);
  });
  it('drops OAuth token, scope and profile injection fields while preserving the Discord start flow', async () => {
    const response = await authPost(new Request(`${base}/api/auth/sign-in/social`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'discord', callbackURL: '/dashboard', idToken: { token: 'forged-token' }, scopes: ['email', 'bot'], disableRedirect: false,
        additionalData: { discordId: '233456789012345678', discordUsername: 'forged' }, discordId: '233456789012345678' }) }));
    expect(response.status).toBe(200); expect(response.headers.get('location')).toBeNull();
    const body = await response.json(); const url = new URL(body.url);
    expect(url.origin).toBe('https://discord.com'); expect(new Set(url.searchParams.get('scope')?.split(' '))).toEqual(new Set(['identify', 'guilds']));
    for (const key of ['accessToken', 'refreshToken', 'user', 'discordId']) expect(body).not.toHaveProperty(key);
  });
  it('does not permit an authenticated session to mutate Discord-derived identity or add a password', async () => {
    const before = await (await authGet(new Request(`${base}/api/auth/get-session`, { headers: { cookie: first.cookie } }))).json();
    for (const path of ['update-user', 'set-password', 'change-password', 'change-email', 'unlink-account']) {
      const response = await authPost(new Request(`${base}/api/auth/${path}`, { method: 'POST', headers: { origin: base, cookie: first.cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Forged identity', discordId: '233456789012345678', discordUsername: 'forged', password: 'Forged password 1234' }) }));
      expect(response.status).toBe(404);
    }
    const after = await (await authGet(new Request(`${base}/api/auth/get-session`, { headers: { cookie: first.cookie } }))).json();
    expect(after.user).toEqual(before.user);
  });
  it('rejects anonymous requests and every password login route without issuing a session', async () => {
    expect((await list(request('GET'), context())).status).toBe(401);
    for (const path of ['sign-in/email', 'sign-up/email', 'change-password', 'set-password', 'reset-password', 'verify-password', 'update-user', 'link-social', 'unlink-account']) {
      const response = await authPost(new Request(`${base}/api/auth/${path}`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: '{}' }));
      expect(response.status).toBe(404); expect(response.headers.get('set-cookie')).toBeNull();
    }
  });
  it('persists messages per account and refuses cross-account reads, updates, and deletes', async () => {
    const created = await create(request('POST', first.cookie, { name: 'Announcement', payload: { content: 'Hello' }, guildId: '', channelId: '', actionIds: [] }), context());
    expect(created.status).toBe(201); const { item } = await created.json();
    expect(item.ownerId).toBe(first.id);
    expect((await (await list(request('GET', first.cookie), context())).json()).items).toHaveLength(1);
    expect((await (await list(request('GET', second.cookie), context())).json()).items).toEqual([]);
    expect((await get(request('GET', second.cookie), context('messages', item.id))).status).toBe(404);
    expect((await update(request('PATCH', second.cookie, { name: 'Stolen' }), context('messages', item.id))).status).toBe(404);
    expect((await remove(request('DELETE', second.cookie), context('messages', item.id))).status).toBe(404);
    expect((await (await get(request('GET', first.cookie), context('messages', item.id))).json()).item.name).toBe('Announcement');
  });
  it('ignores spoofed metadata and detects stale revisions', async () => {
    const created = await create(request('POST', first.cookie, { name: 'Original', payload: { content: 'Hello' }, actionIds: [], ownerId: second.id, id: 'spoofed', revision: 999 }), context());
    expect(created.status).toBe(201); const { item } = await created.json();
    expect(item).toMatchObject({ ownerId: first.id, revision: 1 }); expect(item.id).not.toBe('spoofed');
    const updated = await update(request('PATCH', first.cookie, { name: 'Updated', revision: 1, ownerId: second.id }), context('messages', item.id));
    expect(updated.status).toBe(200); expect((await updated.json()).item).toMatchObject({ ownerId: first.id, revision: 2, name: 'Updated' });
    expect((await update(request('PATCH', first.cookie, { name: 'Stale edit', revision: 1 }), context('messages', item.id))).status).toBe(409);
  });
  it('rejects cross-origin mutations, invalid JSON shapes and oversized request bodies', async () => {
    expect((await create(request('POST', first.cookie, {}, 'https://other.example'), context())).status).toBe(403);
    expect((await create(request('POST', first.cookie, []), context())).status).toBe(400);
    const oversized = new Request(`${base}/api/platform/messages`, { method: 'POST', headers: { origin: base, cookie: first.cookie, 'content-type': 'application/json', 'content-length': '1000001' }, body: '{}' });
    expect((await create(oversized, context())).status).toBe(413);
  });
  it('keeps generated action IDs out of arbitrary raw component payloads', async () => {
    const response = await create(request('POST', first.cookie, { name: 'Bad button', actionIds: [], payload: { content: 'Hello', components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Action', custom_id: 'arbitrary' }] }] } }), context());
    expect(response.status).toBe(400);
  });
  it('keeps OAuth token operations server-only while account lists omit credentials', async () => {
    for (const path of ['get-access-token', 'refresh-token']) {
      const response = await auth.handler(new Request(`${base}/api/auth/${path}`, { method: 'POST',
        headers: { origin: base, cookie: first.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ accountId: 'other-account', userId: second.id }) }));
      expect(response.status).toBe(404);
    }
    const accounts = await auth.handler(new Request(`${base}/api/auth/list-accounts`, { headers: { cookie: first.cookie } }));
    expect(accounts.status).toBe(200); const values = await accounts.json();
    expect(values).toHaveLength(1); expect(values[0].userId).toBe(first.id);
    for (const key of ['password', 'accessToken', 'refreshToken', 'idToken']) expect(values[0]).not.toHaveProperty(key);
    // The disabledPaths restriction applies to HTTP, preserving trusted cron/server access.
    await expect(auth.api.getAccessToken({ body: { accountId: 'missing-account', userId: first.id } })).rejects.toMatchObject({ body: { code: 'ACCOUNT_NOT_FOUND' } });
  });
  it('applies raw JSON edits and preserves uploaded file metadata without a stale visual overwrite', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    await completeMedia(await registerMedia(first.id, { name: 'report.txt', size: 4, type: 'text/plain' }, id));
    const url = `${base}/api/platform/media/${id}`;
    const payload = { content: 'Before', _meowhookFiles: [{ url, name: 'report.txt', fieldKey: 'content_file_0' }] };
    const created = await create(request('POST', first.cookie, { name: 'With file', payload, actionIds: [] }), context());
    expect(created.status).toBe(201); const { item } = await created.json();
    expect(item.payload._meowhookFiles).toEqual(payload._meowhookFiles);
    const changed = await update(request('PATCH', first.cookie, { payload: { ...item.payload, content: 'After' }, revision: item.revision }), context('messages', item.id));
    expect(changed.status).toBe(200); const next = (await changed.json()).item;
    expect(next.payload.content).toBe('After'); expect(next.editorMessage.content).toBe('After');
    expect(next.payload._meowhookFiles).toEqual(payload._meowhookFiles);
    expect(next.editorMessage._attachments).toMatchObject([{ previewUrl: url, name: 'report.txt', platformMediaId: id }]);
  });
  it('round-trips raw Components V2 file references and rejects foreign or unfinished upload IDs', async () => {
    const id = '22222222-2222-4222-8222-222222222222';
    const media = await registerMedia(first.id, { name: 'notes.txt', size: 4, type: 'text/plain' }, id);
    const url = `${base}/api/platform/media/${id}`;
    const payload = { flags: 32768, components: [{ type: 13, file: { url: 'attachment://notes.txt' } }],
      _meowhookFiles: [{ url, name: 'notes.txt', fieldKey: 'component_file_0' }] };
    const send = (cookie = first.cookie) => create(request('POST', cookie, { name: 'V2 file', payload, actionIds: [] }), context());
    expect((await send()).status).toBe(400);
    await completeMedia(media);
    const created = await send(); expect(created.status).toBe(201); const { item } = await created.json();
    expect(item.editorMessage.componentBlocks).toMatchObject([{ type: 'file', url }]);
    expect(item.payload.components).toMatchObject([{ type: 13, file: { url } }]);
    expect(validateDispatch(item.payload)).toBeNull();
    expect((await send(second.cookie)).status).toBe(400);
  });
  it('invalidates a real session when signing out', async () => {
    const signedOut = await auth.handler(new Request(`${base}/api/auth/sign-out`, { method: 'POST', headers: { origin: base, cookie: second.cookie, 'content-type': 'application/json' }, body: '{}' }));
    expect(signedOut.status).toBe(200);
    expect((await list(request('GET', second.cookie), context())).status).toBe(401);
  });
});

describe('bot deployment binding and scope', () => {
  it('binds preconfiguration drafts to the configured app while preserving guild and bot boundaries', async () => {
    const repository = new PlatformRepository(db);
    const action = await repository.put('actions', first.id, { botId: 'meowhook', guildId, type: 'reply', label: 'Help', style: 1, response: 'Hello', enabled: true });
    expect(await platformBotRepository.getAction(appId, guildId, action.id)).toMatchObject({ botId: appId, ownerId: first.id });
    expect(await platformBotRepository.getAction('323456789012345678', guildId, action.id)).toBeNull();
    expect(await platformBotRepository.getAction(appId, '423456789012345678', action.id)).toBeNull();
    await repository.put('commands', first.id, { botId: 'meowhook', guildId, name: 'Help', type: 2, response: 'Hello', enabled: true });
    expect(await platformBotRepository.getCommand(appId, guildId, 'Help', 2)).toMatchObject({ botId: appId });
    expect(await platformBotRepository.getCommand(appId, guildId, 'Help', 3)).toBeNull();
    const otherApp = await repository.put('forms', first.id, { botId: '323456789012345678', guildId, title: 'Other app', enabled: true });
    expect(await platformBotRepository.getForm(appId, guildId, otherApp.id)).toBeNull();
  });
  it('claims a signed interaction only once using the SQL uniqueness constraint', async () => {
    const result = await Promise.all(Array.from({ length: 5 }, () => platformBotRepository.claimInteraction(appId, 'interaction-1')));
    expect(result.filter(Boolean)).toHaveLength(1);
  });
});
