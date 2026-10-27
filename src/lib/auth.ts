import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'kysely';
import { getDatabase, migratePlatform } from '@/lib/platform/database';
import { platformStatus } from '@/lib/platform/config';
import { createAuthOptions } from '@/lib/authOptions';

function secret() {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw new Error('Authentication secret is not configured.');
  mkdirSync(resolve('.data'), { recursive: true });
  const path = resolve('.data/auth-secret');
  if (!existsSync(path)) {
    try { writeFileSync(path, randomBytes(48).toString('base64url'), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  return readFileSync(path, 'utf8');
}

let ready: Promise<ReturnType<typeof betterAuth>> | undefined;
export async function getAuth() {
  if (!platformStatus().authAvailable) throw new Error('Accounts are not configured on this deployment.');
  if (!ready) {
    const config = createAuthOptions({ db: getDatabase(), type: process.env.DATABASE_URL ? 'postgres' : 'sqlite',
      secret: secret(), baseURL: process.env.BETTER_AUTH_URL,
      ...(platformStatus().discordConfigured ? { discord: { clientId: process.env.DISCORD_CLIENT_ID!, clientSecret: process.env.DISCORD_CLIENT_SECRET! } } : {}),
    });
    ready = (async () => {
      const type = process.env.DATABASE_URL ? 'postgres' : 'sqlite';
      await getDatabase().transaction().execute(async transaction => {
        // Cold serverless instances can start together. PostgreSQL coordinates migrations globally.
        if (type === 'postgres') await sql`select pg_advisory_xact_lock(724130851)`.execute(transaction);
        await migratePlatform(transaction);
        const migrations = await getMigrations({ ...config, database: { db: transaction, type } });
        await migrations.runMigrations();
      });
      return betterAuth(config);
    })().catch(error => { ready = undefined; throw error; });
  }
  return ready;
}
