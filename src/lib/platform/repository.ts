import { randomUUID } from 'node:crypto';
import { commandLookupKey, getDatabase, isUniqueConstraintError, type Database } from './database';
import { RESOURCE_NAMES, type ResourceMap, type ResourceName, type RecordMetadata } from './types';
import { PlatformError } from './http';

export function resourceName(value: string): ResourceName {
  if (!RESOURCE_NAMES.includes(value as ResourceName)) throw new PlatformError('Unknown dashboard section.', 404);
  return value as ResourceName;
}
export class PlatformRepository {
  constructor(public db: Database = getDatabase()) {}
  async list<K extends ResourceName>(kind: K, ownerId: string): Promise<ResourceMap[K][]> {
    if (kind === 'schedules') {
      const rows = await this.db.selectFrom('platform_schedule').select('data').where('owner_id', '=', ownerId).orderBy('next_run_at', 'asc').limit(500).execute();
      return rows.map(row => JSON.parse(row.data));
    }
    const rows = await this.db.selectFrom('platform_resource').select('data').where('kind', '=', kind).where('owner_id', '=', ownerId).orderBy('updated_at', 'desc').limit(500).execute();
    return rows.map(row => JSON.parse(row.data));
  }
  async get<K extends ResourceName>(kind: K, ownerId: string, id: string): Promise<ResourceMap[K] | null> {
    const row = kind === 'schedules'
      ? await this.db.selectFrom('platform_schedule').select('data').where('id', '=', id).where('owner_id', '=', ownerId).executeTakeFirst()
      : await this.db.selectFrom('platform_resource').select('data').where('kind', '=', kind).where('id', '=', id).where('owner_id', '=', ownerId).executeTakeFirst();
    return row ? JSON.parse(row.data) : null;
  }
  async put<K extends ResourceName>(kind: K, ownerId: string, fields: Record<string, unknown>, existing?: ResourceMap[K], options: { requireUnleased?: boolean } = {}): Promise<ResourceMap[K]> {
    const now = new Date().toISOString();
    const metadata: RecordMetadata = { id: existing?.id || randomUUID(), ownerId, createdAt: (existing as RecordMetadata | undefined)?.createdAt || now, updatedAt: now, revision: (existing?.revision || 0) + 1 };
    const item = { ...fields, ...metadata } as unknown as ResourceMap[K];
    if (kind === 'schedules') {
      const job = item as ResourceMap['schedules'];
      const values = { id: job.id, owner_id: ownerId, status: job.status, next_run_at: job.nextRunAt, data: JSON.stringify(job), revision: metadata.revision };
      if (!existing) await this.db.insertInto('platform_schedule').values({ ...values, lease_token: null, lease_until: null, phase: null, scheduled_for: null, occurrence_id: null, attempt: 0 }).execute();
      else {
        let update = this.db.updateTable('platform_schedule').set({ ...values,
          ...(options.requireUnleased ? { occurrence_id: null, scheduled_for: null, attempt: 0, phase: null, lease_until: null } : {}),
        }).where('id', '=', job.id).where('owner_id', '=', ownerId).where('revision', '=', existing.revision);
        if (options.requireUnleased) update = update.where('lease_token', 'is', null);
        const result = await update.executeTakeFirst();
        if (!result.numUpdatedRows) throw new PlatformError('This schedule changed or is currently sending. Refresh and try again.', 409);
      }
    } else {
      const values = { id: metadata.id, owner_id: ownerId, kind, guild_id: String(fields.guildId || ''), lookup_key: commandLookupKey(kind, ownerId, fields), data: JSON.stringify(item), revision: metadata.revision, created_at: metadata.createdAt, updated_at: now };
      try {
        if (!existing) await this.db.insertInto('platform_resource').values(values).execute();
        else {
          const result = await this.db.updateTable('platform_resource').set(values).where('id', '=', metadata.id).where('owner_id', '=', ownerId).where('revision', '=', existing.revision).executeTakeFirst();
          if (!result.numUpdatedRows) throw new PlatformError('This item changed in another tab. Refresh and try again.', 409);
        }
      } catch (error) {
        if (isUniqueConstraintError(error)) throw new PlatformError('A command with this name and type already exists in this server or account.', 409);
        throw error;
      }
    }
    return item;
  }
  async remove(kind: ResourceName, ownerId: string, id: string) {
    if (kind === 'schedules') {
      const result = await this.db.deleteFrom('platform_schedule').where('owner_id', '=', ownerId).where('id', '=', id).where('lease_token', 'is', null).executeTakeFirst();
      if (!result.numDeletedRows) throw new PlatformError('This schedule is currently sending. Try again shortly.', 409);
    } else {
      await this.db.deleteFrom('platform_resource').where('kind', '=', kind).where('id', '=', id).where('owner_id', '=', ownerId).execute();
    }
  }
  async event(ownerId: string, kind: string, data: Record<string, unknown>) {
    await this.db.insertInto('platform_event').values({ id: randomUUID(), owner_id: ownerId, kind, data: JSON.stringify(data), created_at: new Date().toISOString() }).execute();
  }
}
