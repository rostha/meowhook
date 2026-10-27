import { randomUUID } from 'node:crypto';
import { getDatabase, type Database } from './database';
import type { ScheduleClaim, ScheduledJob, ScheduleRepository } from '@/lib/scheduling/types';

export class SqlScheduleRepository implements ScheduleRepository {
  constructor(private db: Database = getDatabase()) {}
  async claimDue(input: { now: string; leaseUntil: string; workerId: string; limit: number }): Promise<ScheduleClaim[]> {
    // Reap leases independently of status: pause/cancel can arrive while a request is
    // in flight. Leaving those rows leased forever would also prevent deleting them.
    const expired = await this.db.selectFrom('platform_schedule').selectAll()
      .where('lease_token', 'is not', null).where('lease_until', '<=', input.now).limit(input.limit * 3).execute();
    for (const row of expired) {
      const original = JSON.parse(row.data) as ScheduledJob;
      const interrupted = row.phase === 'sending';
      const job: ScheduledJob = { ...original, revision: row.revision + 1, updatedAt: input.now,
        ...(interrupted ? { status: original.status === 'cancelled' ? 'cancelled' : 'failed',
          attempts: row.attempt, lastErrorKind: 'uncertain',
          lastError: 'Delivery was interrupted after it began. Check the channel before scheduling again.' } as const : {}),
      };
      await this.db.updateTable('platform_schedule').set({ status: job.status, data: JSON.stringify(job), revision: job.revision,
        lease_token: null, lease_until: null, phase: null,
        ...(interrupted || job.status !== 'active' ? { occurrence_id: null, scheduled_for: null, attempt: 0 } : {}),
      }).where('id', '=', row.id).where('revision', '=', row.revision).where('lease_token', '=', row.lease_token)
        .where('lease_until', '<=', input.now).execute();
    }
    const rows = await this.db.selectFrom('platform_schedule').selectAll().where('status', '=', 'active')
      .where('next_run_at', '<=', input.now)
      .where(eb => eb.or([eb('lease_token', 'is', null), eb('lease_until', '<=', input.now)]))
      .orderBy('next_run_at', 'asc').limit(input.limit * 3).execute();
    const claims: ScheduleClaim[] = [];
    for (const row of rows) {
      if (claims.length >= input.limit) break;
      const job = JSON.parse(row.data) as ScheduledJob;
      const guard = this.db.updateTable('platform_schedule').where('id', '=', row.id).where('revision', '=', row.revision)
        .where('status', '=', 'active').where('lease_token', row.lease_token ? '=' : 'is', row.lease_token);
      if (row.phase === 'sending') {
        const uncertain = { ...job, status: 'failed', lastErrorKind: 'uncertain', lastError: 'Delivery was interrupted after it began. Check the channel before scheduling again.', revision: job.revision + 1, updatedAt: input.now };
        await guard.set({ status: 'failed', data: JSON.stringify(uncertain), revision: uncertain.revision,
          lease_token: null, lease_until: null, phase: null }).execute();
        continue;
      }
      const leaseToken = `${input.workerId}:${randomUUID()}`;
      const occurrenceId = row.occurrence_id || randomUUID();
      const scheduledFor = row.scheduled_for || job.nextRunAt;
      const attempt = row.attempt + 1;
      const result = await guard.set({ lease_token: leaseToken, lease_until: input.leaseUntil,
        phase: 'claimed', occurrence_id: occurrenceId, scheduled_for: scheduledFor, attempt }).executeTakeFirst();
      if (result.numUpdatedRows) claims.push({ job, leaseToken, occurrenceId, scheduledFor, attempt });
    }
    return claims;
  }
  async beginDelivery(claim: ScheduleClaim, now: string) {
    const result = await this.db.updateTable('platform_schedule').set({ phase: 'sending' })
      .where('id', '=', claim.job.id).where('lease_token', '=', claim.leaseToken).where('revision', '=', claim.job.revision)
      .where('status', '=', 'active').where('phase', '=', 'claimed').where('lease_until', '>', now).executeTakeFirst();
    return Boolean(result.numUpdatedRows);
  }
  private async mutate(claim: ScheduleClaim, apply: (job: ScheduledJob) => ScheduledJob, resetOccurrence: boolean, retryAt?: string, requiredPhase?: string) {
    // Compare-and-swap also preserves pause/cancel requests accepted while Discord was responding.
    for (let i = 0; i < 3; i++) {
      const row = await this.db.selectFrom('platform_schedule').selectAll().where('id', '=', claim.job.id).where('lease_token', '=', claim.leaseToken).executeTakeFirst();
      if (!row) return false;
      if (requiredPhase && row.phase !== requiredPhase) return false;
      const job = apply(JSON.parse(row.data));
      job.revision = row.revision + 1;
      const result = await this.db.updateTable('platform_schedule').set({ status: job.status,
        data: JSON.stringify(job), revision: job.revision, next_run_at: retryAt || job.nextRunAt,
        lease_token: null, lease_until: null, phase: null,
        ...(resetOccurrence ? { occurrence_id: null, scheduled_for: null, attempt: 0 } : {}),
      }).where('id', '=', row.id).where('lease_token', '=', claim.leaseToken).where('revision', '=', row.revision).executeTakeFirst();
      if (result.numUpdatedRows) return true;
    }
    return false;
  }
  async complete(claim: ScheduleClaim, result: { completedAt: string; messageId: string; nextRunAt: string | null }) {
    return this.mutate(claim, job => ({ ...job,
      status: job.status === 'active' ? (result.nextRunAt ? 'active' : 'completed') : job.status,
      nextRunAt: result.nextRunAt || job.nextRunAt, attempts: claim.attempt,
      lastRunAt: result.completedAt, lastMessageId: result.messageId, lastError: undefined, lastErrorKind: undefined, updatedAt: result.completedAt,
    }), true, undefined, 'sending');
  }
  async retry(claim: ScheduleClaim, result: { retryAt: string; error: string }) {
    return this.mutate(claim, job => ({ ...job, nextRunAt: result.retryAt, attempts: claim.attempt,
      lastError: result.error, updatedAt: new Date().toISOString() }), false, result.retryAt);
  }
  async fail(claim: ScheduleClaim, result: { at: string; error: string; uncertain: boolean }) {
    return this.mutate(claim, job => ({ ...job, status: job.status === 'cancelled' ? 'cancelled' : 'failed',
      attempts: claim.attempt, lastError: result.error, lastErrorKind: result.uncertain ? 'uncertain' : 'rejected', updatedAt: result.at }), true);
  }
}
