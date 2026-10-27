import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { commandLookupKey, getDatabase, isUniqueConstraintError, migratePlatform } from './database';
import { PlatformRepository } from './repository';

describe('Atomic application command uniqueness', () => {
  const applicationId = '222222222222222222';
  const guildId = '111111111111111111';
  const fields = (name: string, extra: Record<string, unknown> = {}) => ({ botId: applicationId, guildId, name, type: 1, description: 'Test command', response: 'Hello', enabled: true, ...extra });
  let repository: PlatformRepository;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('VERCEL', ''); vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('MEOWHOOK_LOCAL_DATABASE', ':memory:');
    const db = getDatabase();
    // Reproduce a pre-upgrade installation that has no lookup_key column.
    await db.schema.createTable('platform_resource').addColumn('id', 'text', column => column.primaryKey())
      .addColumn('owner_id', 'text', column => column.notNull()).addColumn('kind', 'text', column => column.notNull())
      .addColumn('guild_id', 'text', column => column.notNull()).addColumn('data', 'text', column => column.notNull())
      .addColumn('revision', 'integer', column => column.notNull()).addColumn('created_at', 'text', column => column.notNull())
      .addColumn('updated_at', 'text', column => column.notNull()).execute();
    const legacy = { ...fields('legacy'), id: 'old-command', ownerId: 'old-owner', revision: 1 };
    await db.insertInto('platform_resource').values({ id: legacy.id, owner_id: legacy.ownerId, kind: 'commands', guild_id: guildId, data: JSON.stringify(legacy), revision: 1, created_at: '2026-01-01', updated_at: '2026-01-01' }).execute();
    await migratePlatform(db); await migratePlatform(db);
    repository = new PlatformRepository();
  });
  afterAll(async () => { await getDatabase().destroy(); vi.unstubAllEnvs(); });

  it('upgrades and backfills an old schema idempotently', async () => {
    const row = await getDatabase().selectFrom('platform_resource').select('lookup_key').where('id', '=', 'old-command').executeTakeFirstOrThrow();
    expect(row.lookup_key).toBe(commandLookupKey('commands', 'old-owner', fields('legacy')));
    await expect(repository.put('commands', 'new-owner', fields('legacy'))).rejects.toMatchObject({ status: 409 });
  });

  it('admits one winner when two owners create the same command concurrently', async () => {
    const attempts = await Promise.allSettled([
      repository.put('commands', 'alice', fields('simultaneous')),
      repository.put('commands', 'bob', fields('simultaneous')),
    ]);
    expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
    const failure = attempts.find(attempt => attempt.status === 'rejected') as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ status: 409 });
    const rows = await getDatabase().selectFrom('platform_resource').select('id').where('lookup_key', '=', commandLookupKey('commands', 'ignored', fields('simultaneous'))).execute();
    expect(rows).toHaveLength(1);
  });

  it('scopes unbound drafts to their owner, and distinguishes command types, applications and servers', async () => {
    await repository.put('commands', 'alice', fields('draft', { guildId: '' }));
    await expect(repository.put('commands', 'alice', fields('draft', { guildId: '' }))).rejects.toMatchObject({ status: 409 });
    await expect(repository.put('commands', 'bob', fields('draft', { guildId: '' }))).resolves.toMatchObject({ ownerId: 'bob' });
    await repository.put('commands', 'alice', fields('distinct'));
    await expect(repository.put('commands', 'alice', fields('distinct', { type: 2 }))).resolves.toMatchObject({ type: 2 });
    await expect(repository.put('commands', 'alice', fields('distinct', { guildId: '333333333333333333' }))).resolves.toBeTruthy();
    await expect(repository.put('commands', 'alice', fields('distinct', { botId: '444444444444444444' }))).resolves.toBeTruthy();
  });

  it('keeps the old name and revision when an atomic rename conflicts, and releases it on success', async () => {
    const alpha = await repository.put('commands', 'alice', fields('alpha'));
    await repository.put('commands', 'bob', fields('beta'));
    await expect(repository.put('commands', 'alice', fields('beta'), alpha)).rejects.toMatchObject({ status: 409 });
    expect(await repository.get('commands', 'alice', alpha.id)).toMatchObject({ name: 'alpha', revision: 1 });
    await expect(repository.put('commands', 'bob', fields('alpha'))).rejects.toMatchObject({ status: 409 });
    await repository.put('commands', 'alice', fields('gamma'), alpha);
    await expect(repository.put('commands', 'bob', fields('alpha'))).resolves.toMatchObject({ name: 'alpha' });
  });

  it('allows ordinary records to share names and translates only unique constraint errors', async () => {
    const first = await repository.put('messages', 'alice', { name: 'Same name', guildId, channelId: '', payload: { content: 'Hi' }, actionIds: [] });
    const second = await repository.put('messages', 'alice', { name: 'Same name', guildId, channelId: '', payload: { content: 'Hi' }, actionIds: [] });
    expect(first.id).not.toBe(second.id);
    expect(commandLookupKey('messages', 'alice', { name: 'Same name' })).toBeNull();
    expect(isUniqueConstraintError({ code: '23505' })).toBe(true);
    expect(isUniqueConstraintError({ code: 'ERR_SQLITE_ERROR', errcode: 2067 })).toBe(true);
    expect(isUniqueConstraintError(new Error('network timeout'))).toBe(false);
  });
});
