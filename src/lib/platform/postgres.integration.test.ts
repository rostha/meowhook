import { PGlite } from '@electric-sql/pglite';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { Kysely, PostgresDialect, sql, type PostgresPool, type PostgresQueryResult } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { migratePlatform, type Database, type PlatformDatabase } from './database';
import { PlatformRepository } from './repository';
import { SqlScheduleRepository } from './scheduleRepository';
import { runScheduledMessages } from '@/lib/scheduling/runner';
import { createAuthOptions } from '@/lib/authOptions';
import { mockDiscordOAuth } from '@/lib/testing/discordOAuth';

/**
 * Executes PostgreSQL SQL in the real PostgreSQL WASM engine. Only pg's network
 * transport is adapted: the production Kysely PostgresDialect is unchanged.
 * A reservation queue respects PGlite's single exclusive connection, including transactions.
 */
function postgresPool(postgres: PGlite): PostgresPool {
  let available = Promise.resolve();
  return {
    options: {},
    async connect() {
      const previous = available;
      let release!: () => void;
      available = new Promise<void>(resolve => { release = resolve; });
      await previous;
      const client = {
        async query<R>(statement: string, parameters: readonly unknown[] = []): Promise<PostgresQueryResult<R>> {
          const result = await postgres.query(statement, [...parameters]);
          const keyword = /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.exec(statement)?.[1].toUpperCase();
          return { command: (keyword || 'SELECT') as PostgresQueryResult<R>['command'], rowCount: result.affectedRows ?? result.rows.length, rows: result.rows as R[] };
        },
        release,
      };
      // Cursor streaming is unused by platform/auth queries. All string queries
      // retain PostgreSQL placeholders, errors, RETURNING and catalog introspection.
      return client as Awaited<ReturnType<PostgresPool['connect']>>;
    },
    end: () => postgres.close(),
  };
}

describe('Production PostgreSQL dialect, schema, sessions and scheduler', () => {
  let postgres: PGlite;
  let db: Database;
  let repository: PlatformRepository;
  let auth: ReturnType<typeof betterAuth>;
  const guildId = '111111111111111111', botId = '222222222222222222', channelId = '888888888888888888';
  const baseURL = 'http://localhost:3000';
  const oauth = mockDiscordOAuth(baseURL);

  beforeAll(async () => {
    postgres = await PGlite.create();
    db = new Kysely<PlatformDatabase>({ dialect: new PostgresDialect({ pool: postgresPool(postgres) }) });
    vi.stubGlobal('fetch', oauth.fetch);
    const config = createAuthOptions({ db, type: 'postgres', baseURL, secret: 'postgres-integration-test-secret-that-is-not-a-real-credential',
      discord: { clientId: botId, clientSecret: 'test-only-discord-oauth-secret' } });
    // Match the production cold-start sequence, including its advisory migration lock.
    await db.transaction().execute(async transaction => {
      await sql`select pg_advisory_xact_lock(724130851)`.execute(transaction);
      await migratePlatform(transaction);
      const migrations = await getMigrations({ ...config, database: { db: transaction, type: 'postgres' } });
      await migrations.runMigrations();
    });
    await migratePlatform(db); // Idempotent against PostgreSQL catalog introspection.
    auth = betterAuth(config);
    repository = new PlatformRepository(db);
  }, 60_000);
  afterAll(async () => { if (db) await db.destroy(); vi.unstubAllGlobals(); });

  it('creates the platform indexes and Better Auth tables in PostgreSQL', async () => {
    const tables = await db.introspection.getTables();
    expect(tables.map(table => table.name)).toEqual(expect.arrayContaining(['platform_resource', 'platform_schedule', 'platform_interaction', 'platform_event', 'user', 'session', 'account', 'verification', 'rateLimit']));
    const indexes = await postgres.query<{ indexname: string }>("select indexname from pg_indexes where tablename = 'platform_resource'");
    expect(indexes.rows.map(row => row.indexname)).toContain('platform_resource_lookup');
  });

  it('persists account-scoped documents and rejects stale updates with PostgreSQL RETURNING counts', async () => {
    const item = await repository.put('messages', 'alice', { name: 'Announcement', guildId, channelId, payload: { content: 'Hello' }, actionIds: [] });
    expect(await repository.get('messages', 'bob', item.id)).toBeNull();
    expect(await repository.list('messages', 'bob')).toEqual([]);
    await repository.put('messages', 'alice', { ...item, name: 'Updated' }, item);
    await expect(repository.put('messages', 'alice', { ...item, name: 'Stale copy' }, item)).rejects.toMatchObject({ status: 409 });
    expect(await repository.get('messages', 'alice', item.id)).toMatchObject({ name: 'Updated', revision: 2 });
  });

  it('atomically reserves command names across administrators and preserves failed renames', async () => {
    const command = { botId, guildId, type: 1, name: 'hello', description: 'Say hello', response: 'Hello', enabled: true };
    const attempts = await Promise.allSettled([repository.put('commands', 'alice', command), repository.put('commands', 'bob', command)]);
    expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
    expect((attempts.find(attempt => attempt.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    const other = await repository.put('commands', 'charlie', { ...command, name: 'other' });
    await expect(repository.put('commands', 'charlie', command, other)).rejects.toMatchObject({ status: 409 });
    expect(await repository.get('commands', 'charlie', other.id)).toMatchObject({ name: 'other', revision: 1 });
  });

  it('claims and dispatches one scheduled occurrence with PostgreSQL conditional updates', async () => {
    const due = new Date(Date.now() - 60_000).toISOString();
    const job = await repository.put('schedules', 'alice', { messageId: 'scheduled-document', guildId, channelId, payload: { content: 'Scheduled' }, actionIds: [],
      rule: { frequency: 'once', timezone: 'UTC', localTime: '00:00', startsAt: due }, nextRunAt: due, status: 'active', attempts: 0 });
    const scheduling = new SqlScheduleRepository(db);
    let sends = 0;
    const send = async () => { sends++; return { messageId: '999999999999999999' }; };
    const results = await Promise.all([runScheduledMessages({ repository: scheduling, send, workerId: 'worker-one' }), runScheduledMessages({ repository: scheduling, send, workerId: 'worker-two' })]);
    expect(results.flat()).toMatchObject([{ scheduleId: job.id, status: 'sent' }]); expect(sends).toBe(1);
    expect(await repository.get('schedules', 'alice', job.id)).toMatchObject({ status: 'completed', lastMessageId: '999999999999999999' });
  });

  it('runs a genuine Discord OAuth callback, encrypted account storage, session lookup and sign-out against PostgreSQL', async () => {
    const discordId = '323456789012345678';
    const { cookie, id: userId, authorizationUrl } = await oauth.signIn(auth, discordId);
    expect(cookie).toContain('session_token=');
    expect(new URL(authorizationUrl).searchParams.get('scope')?.split(' ').sort()).toEqual(['guilds', 'identify']);
    const account = await postgres.query<{ accountId: string; userId: string; accessToken: string; password: string | null }>('select "accountId", "userId", "accessToken", password from account where "providerId" = $1 and "accountId" = $2', ['discord', discordId]);
    expect(account.rows).toHaveLength(1); expect(account.rows[0]).toMatchObject({ accountId: discordId, userId, password: null });
    expect(account.rows[0].accessToken).not.toContain('test-access-');
    expect(account.rows[0].accessToken.length).toBeGreaterThan(20);
    expect((await postgres.query('select id from account where "providerId" = $1', ['credential'])).rows).toEqual([]);
    const session = await auth.handler(new Request(`${baseURL}/api/auth/get-session`, { headers: { Cookie: cookie } }));
    expect(session.status).toBe(200); expect(await session.json()).toMatchObject({ user: { id: userId, discordId } });
    for (const path of ['sign-in/email', 'sign-up/email', 'set-password']) {
      const blocked = await auth.handler(new Request(`${baseURL}/api/auth/${path}`, { method: 'POST', headers: { Origin: baseURL, 'Content-Type': 'application/json', Cookie: cookie }, body: '{}' }));
      expect(blocked.status).toBe(404); expect(blocked.headers.get('set-cookie')).toBeNull();
    }
    const signOut = await auth.handler(new Request(`${baseURL}/api/auth/sign-out`, { method: 'POST', headers: { Origin: baseURL, 'Content-Type': 'application/json', Cookie: cookie }, body: '{}' }));
    expect(signOut.status).toBe(200);
    const signedOut = await auth.handler(new Request(`${baseURL}/api/auth/get-session`, { headers: { Cookie: cookie } }));
    expect(await signedOut.json()).toBeNull();
  }, 15_000);

  it('uses stable Discord IDs across profile renames and never merges separate Discord identities by email or username', async () => {
    const firstDiscordId = '523456789012345678', secondDiscordId = '623456789012345678';
    const first = await oauth.signIn(auth, firstDiscordId, { username: 'original_name', global_name: 'Original member', email: null });
    const renamed = await oauth.signIn(auth, firstDiscordId, { username: 'renamed_member', global_name: 'Current member', email: 'shared@example.test', verified: true });
    const distinct = await oauth.signIn(auth, secondDiscordId, { username: 'renamed_member', global_name: 'Current member', email: 'shared@example.test', verified: true });
    expect(renamed.id).toBe(first.id); expect(distinct.id).not.toBe(first.id);
    const current = await auth.handler(new Request(`${baseURL}/api/auth/get-session`, { headers: { Cookie: renamed.cookie } }));
    expect(await current.json()).toMatchObject({ user: { id: first.id, discordId: firstDiscordId, discordUsername: 'renamed_member', name: 'Current member' } });
    const users = await postgres.query<{ id: string; discordId: string; email: string }>('select id, "discordId", email from "user" where id in ($1, $2)', [first.id, distinct.id]);
    expect(users.rows).toHaveLength(2); expect(users.rows.map(user => user.discordId).sort()).toEqual([firstDiscordId, secondDiscordId]);
    expect(users.rows.some(user => user.email === 'shared@example.test')).toBe(false);
  }, 15_000);
});
