import { Kysely, PostgresDialect, SqliteDialect, type SqliteDatabase } from 'kysely';
import { Pool } from 'pg';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

interface ResourceRow {
  id: string; owner_id: string; kind: string; guild_id: string; data: string;
  lookup_key: string | null;
  revision: number; created_at: string; updated_at: string;
}
interface ScheduleRow {
  id: string; owner_id: string; status: string; next_run_at: string | null; data: string;
  lease_token: string | null; lease_until: string | null; phase: string | null;
  scheduled_for: string | null; occurrence_id: string | null; attempt: number; revision: number;
}
export interface PlatformDatabase {
  platform_resource: ResourceRow;
  platform_schedule: ScheduleRow;
  platform_interaction: { key: string; created_at: string };
  platform_event: { id: string; owner_id: string; kind: string; data: string; created_at: string };
}
export type Database = Kysely<PlatformDatabase>;

/** The same application command name/type belongs to one server, across all dashboard owners. */
export function commandLookupKey(kind: string, ownerId: string, fields: Record<string, unknown>): string | null {
  if (kind !== 'commands') return null;
  const guildId = String(fields.guildId || '');
  return JSON.stringify([String(fields.botId || ''), guildId ? 'guild' : 'owner', guildId || ownerId, Number(fields.type), String(fields.name || '')]);
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; errcode?: unknown; message?: unknown };
  return candidate.code === '23505' || candidate.code === 'SQLITE_CONSTRAINT_UNIQUE' || candidate.errcode === 2067
    || (typeof candidate.message === 'string' && /UNIQUE constraint failed: platform_resource\.(lookup_key|id)/.test(candidate.message));
}

let instance: Database | undefined;
export function getDatabase(): Database {
  if (instance) return instance;
  if (process.env.DATABASE_URL) {
    instance = new Kysely<PlatformDatabase>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }) }) });
  } else {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw new Error('Persistent database is not configured.');
    // Local development only. Vercel never writes accounts to its ephemeral filesystem.
    mkdirSync(resolve('.data'), { recursive: true });
    // require keeps this native Node-only module out of browser and Edge bundles.
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const native = new DatabaseSync(process.env.MEOWHOOK_LOCAL_DATABASE || resolve('.data/platform.sqlite'));
    native.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const database: SqliteDatabase = {
      close: () => native.close(),
      prepare(query) {
        const statement = native.prepare(query);
        return {
          reader: statement.columns().length > 0,
          all: parameters => statement.all(...parameters as import('node:sqlite').SQLInputValue[]),
          run: parameters => statement.run(...parameters as import('node:sqlite').SQLInputValue[]),
          iterate: parameters => statement.iterate(...parameters as import('node:sqlite').SQLInputValue[]),
        };
      },
    };
    instance = new Kysely<PlatformDatabase>({ dialect: new SqliteDialect({ database }) });
  }
  return instance;
}

export async function migratePlatform(db: Database) {
  await db.schema.createTable('platform_resource').ifNotExists()
    .addColumn('id', 'text', c => c.primaryKey()).addColumn('owner_id', 'text', c => c.notNull())
    .addColumn('kind', 'text', c => c.notNull()).addColumn('guild_id', 'text', c => c.notNull())
    .addColumn('lookup_key', 'text')
    .addColumn('data', 'text', c => c.notNull()).addColumn('revision', 'integer', c => c.notNull())
    .addColumn('created_at', 'text', c => c.notNull()).addColumn('updated_at', 'text', c => c.notNull()).execute();
  // SQLite lacks ADD COLUMN IF NOT EXISTS. Introspection also supports existing Postgres tables.
  const table = (await db.introspection.getTables()).find(candidate => candidate.name === 'platform_resource');
  if (!table?.columns.some(column => column.name === 'lookup_key')) {
    try { await db.schema.alterTable('platform_resource').addColumn('lookup_key', 'text').execute(); }
    catch (error) {
      const candidate = error as { code?: string; message?: string };
      // Another process may have performed the same migration after our introspection.
      if (candidate.code !== '42701' && !/duplicate column name: lookup_key/i.test(candidate.message || '')) throw error;
    }
  }
  const commands = await db.selectFrom('platform_resource').select(['id', 'owner_id', 'data']).where('kind', '=', 'commands').where('lookup_key', 'is', null).execute();
  for (const row of commands) {
    const fields = JSON.parse(row.data) as Record<string, unknown>;
    await db.updateTable('platform_resource').set({ lookup_key: commandLookupKey('commands', row.owner_id, fields) }).where('id', '=', row.id).where('lookup_key', 'is', null).execute();
  }
  await db.schema.createIndex('platform_resource_lookup').ifNotExists().on('platform_resource').column('lookup_key').unique().execute();
  await db.schema.createIndex('platform_resource_owner_kind').ifNotExists().on('platform_resource').columns(['owner_id', 'kind']).execute();
  await db.schema.createTable('platform_schedule').ifNotExists().addColumn('id', 'text', c => c.primaryKey())
    .addColumn('owner_id', 'text', c => c.notNull()).addColumn('status', 'text', c => c.notNull())
    .addColumn('next_run_at', 'text').addColumn('data', 'text', c => c.notNull())
    .addColumn('lease_token', 'text').addColumn('lease_until', 'text').addColumn('phase', 'text')
    .addColumn('scheduled_for', 'text').addColumn('occurrence_id', 'text')
    .addColumn('attempt', 'integer', c => c.notNull().defaultTo(0)).addColumn('revision', 'integer', c => c.notNull()).execute();
  await db.schema.createIndex('platform_schedule_due').ifNotExists().on('platform_schedule').columns(['status', 'next_run_at']).execute();
  await db.schema.createTable('platform_interaction').ifNotExists().addColumn('key', 'text', c => c.primaryKey()).addColumn('created_at', 'text', c => c.notNull()).execute();
  await db.schema.createTable('platform_event').ifNotExists().addColumn('id', 'text', c => c.primaryKey()).addColumn('owner_id', 'text', c => c.notNull())
    .addColumn('kind', 'text', c => c.notNull()).addColumn('data', 'text', c => c.notNull()).addColumn('created_at', 'text', c => c.notNull()).execute();
}
