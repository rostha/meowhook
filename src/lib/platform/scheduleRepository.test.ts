import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabase, migratePlatform, type Database } from './database';
import { SqlScheduleRepository } from './scheduleRepository';
import { PlatformRepository } from './repository';
import type { ScheduledJob } from '@/lib/scheduling/types';
import { runScheduledMessages, ScheduledDeliveryError } from '@/lib/scheduling/runner';

const time = '2026-10-26T09:00:00.000Z';
const afterLease = '2026-10-26T09:02:00.000Z';
let db: Database;
let scheduler: SqlScheduleRepository;
let resources: PlatformRepository;
function job(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return { id: 'schedule', ownerId: 'account', messageId: 'message', guildId: 'server', channelId: 'channel',
    payload: { content: 'Scheduled message' }, actionIds: [], rule: { frequency: 'once', timezone: 'UTC', localTime: '09:00', startsAt: time },
    nextRunAt: time, status: 'active', revision: 1, attempts: 0, createdAt: time, updatedAt: time, ...overrides };
}
async function insert(value = job()) {
  await db.insertInto('platform_schedule').values({ id: value.id, owner_id: value.ownerId, status: value.status, next_run_at: value.nextRunAt,
    data: JSON.stringify(value), revision: value.revision, lease_token: null, lease_until: null, phase: null, scheduled_for: null, occurrence_id: null, attempt: 0 }).execute();
  return value;
}
const claim = (workerId = 'first', now = time) => scheduler.claimDue({ now, workerId,
  leaseUntil: new Date(Date.parse(now) + 90_000).toISOString(), limit: 5 });
async function stored(id = 'schedule') { return (await resources.get('schedules', 'account', id))!; }

beforeAll(async () => {
  vi.stubEnv('MEOWHOOK_LOCAL_DATABASE', ':memory:'); vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('NODE_ENV', 'test');
  db = getDatabase(); await migratePlatform(db); scheduler = new SqlScheduleRepository(db); resources = new PlatformRepository(db);
});
beforeEach(async () => { await db.deleteFrom('platform_schedule').execute(); });
afterAll(async () => { await db.destroy(); vi.unstubAllEnvs(); });

describe('SQL schedule leases and delivery state', () => {
  it('claims only active jobs that are due, in chronological order', async () => {
    await insert(job({ id: 'future', nextRunAt: '2026-10-27T09:00:00.000Z' }));
    await insert(job({ id: 'paused', status: 'paused' }));
    await insert(job({ id: 'cancelled', status: 'cancelled' }));
    await insert(job({ id: 'later' }));
    await insert(job({ id: 'earlier', nextRunAt: '2026-10-25T09:00:00.000Z' }));
    expect((await claim()).map(item => item.job.id)).toEqual(['earlier', 'later']);
  });
  it('atomically gives a due occurrence to only one concurrent worker', async () => {
    await insert();
    const batches = await Promise.all([claim('worker-a'), claim('worker-b'), claim('worker-c')]);
    expect(batches.flat()).toHaveLength(1);
    expect((await claim('worker-d'))).toEqual([]);
  });
  it('reclaims an expired claim before sending with the same occurrence and a new lease', async () => {
    await insert(); const first = (await claim())[0]; const next = (await claim('replacement', afterLease))[0];
    expect(next.occurrenceId).toBe(first.occurrenceId);
    expect(next.scheduledFor).toBe(first.scheduledFor);
    expect(next.leaseToken).not.toBe(first.leaseToken);
    expect(next.attempt).toBe(2);
    expect(await scheduler.beginDelivery(first, afterLease)).toBe(false);
    expect(await scheduler.complete(first, { completedAt: afterLease, messageId: 'stale', nextRunAt: null })).toBe(false);
    expect(await scheduler.beginDelivery(next, afterLease)).toBe(true);
  });
  it('never reclaims an expired sending lease as another send', async () => {
    await insert(); const first = (await claim())[0];
    expect(await scheduler.beginDelivery(first, time)).toBe(true);
    expect(await claim('replacement', afterLease)).toEqual([]);
    expect(await stored()).toMatchObject({ status: 'failed', lastErrorKind: 'uncertain' });
    expect(await scheduler.complete(first, { completedAt: afterLease, messageId: 'late', nextRunAt: null })).toBe(false);
  });
  it('cleans expired sending leases even if cancelled while sending', async () => {
    const original = await insert(); const first = (await claim())[0]; await scheduler.beginDelivery(first, time);
    await resources.put('schedules', 'account', { ...original, status: 'cancelled' }, original);
    expect(await claim('replacement', afterLease)).toEqual([]);
    expect(await stored()).toMatchObject({ status: 'cancelled', lastErrorKind: 'uncertain' });
    const row = await db.selectFrom('platform_schedule').selectAll().where('id', '=', 'schedule').executeTakeFirstOrThrow();
    expect(row.lease_token).toBeNull();
    await expect(resources.remove('schedules', 'account', 'schedule')).resolves.toBeUndefined();
  });
  it('clears an expired non-sending paused claim so it can be deleted', async () => {
    const original = await insert(); await claim();
    await resources.put('schedules', 'account', { ...original, status: 'paused' }, original);
    await claim('replacement', afterLease);
    await expect(resources.remove('schedules', 'account', 'schedule')).resolves.toBeUndefined();
  });
  it('refuses delivery at or after lease expiry and before a successful begin', async () => {
    await insert(); const first = (await claim())[0];
    expect(await scheduler.complete(first, { completedAt: time, messageId: 'not-started', nextRunAt: null })).toBe(false);
    expect(await scheduler.beginDelivery(first, '2026-10-26T09:01:30.000Z')).toBe(false);
  });
  it.each(['paused', 'cancelled'] as const)('records a receipt while preserving a concurrent %s request', async status => {
    const original = await insert(); const first = (await claim())[0]; await scheduler.beginDelivery(first, time);
    await resources.put('schedules', 'account', { ...original, status }, original);
    expect(await scheduler.complete(first, { completedAt: time, messageId: 'discord-receipt', nextRunAt: '2026-10-27T09:00:00.000Z' })).toBe(true);
    expect(await stored()).toMatchObject({ status, lastMessageId: 'discord-receipt', revision: 3 });
  });
  it('records a one-time receipt once and rejects stale completion attempts', async () => {
    await insert(); const first = (await claim())[0]; await scheduler.beginDelivery(first, time);
    expect(await scheduler.complete(first, { completedAt: time, messageId: 'discord-receipt', nextRunAt: null })).toBe(true);
    expect(await scheduler.complete(first, { completedAt: time, messageId: 'duplicate', nextRunAt: null })).toBe(false);
    expect(await stored()).toMatchObject({ status: 'completed', lastMessageId: 'discord-receipt' });
    expect(await claim()).toEqual([]);
  });
  it('keeps occurrence identity across a safe rate limit retry and clears it after success', async () => {
    await insert(); const first = (await claim())[0]; await scheduler.beginDelivery(first, time);
    const retryAt = '2026-10-26T09:01:00.000Z';
    expect(await scheduler.retry(first, { retryAt, error: 'Rate limited' })).toBe(true);
    expect(await claim('too-early')).toEqual([]);
    const next = (await claim('retry', retryAt))[0];
    expect(next).toMatchObject({ occurrenceId: first.occurrenceId, attempt: 2, scheduledFor: time });
    await scheduler.beginDelivery(next, retryAt); await scheduler.complete(next, { completedAt: retryAt, messageId: 'sent-once', nextRunAt: null });
    const row = await db.selectFrom('platform_schedule').selectAll().where('id', '=', 'schedule').executeTakeFirstOrThrow();
    expect(row.occurrence_id).toBeNull(); expect(row.attempt).toBe(0);
  });
  it('runs two simultaneous worker invocations with one actual mocked Discord POST', async () => {
    await insert(); const send = vi.fn().mockResolvedValue({ messageId: 'sent-once' });
    const output = await Promise.all([runScheduledMessages({ repository: scheduler, send, now: () => new Date(time), workerId: 'first' }),
      runScheduledMessages({ repository: scheduler, send, now: () => new Date(time), workerId: 'second' })]);
    expect(output.flat()).toHaveLength(1); expect(send).toHaveBeenCalledTimes(1);
    expect(await stored()).toMatchObject({ status: 'completed', lastMessageId: 'sent-once' });
  });
  it('persists ambiguous outcomes without making the occurrence eligible again', async () => {
    await insert(); const send = vi.fn().mockRejectedValue(new ScheduledDeliveryError('uncertain', 'Connection lost after request body'));
    expect((await runScheduledMessages({ repository: scheduler, send, now: () => new Date(time) }))[0].status).toBe('uncertain');
    expect(await stored()).toMatchObject({ status: 'failed', lastErrorKind: 'uncertain' });
    await runScheduledMessages({ repository: scheduler, send, now: () => new Date(afterLease) });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
