import { createHash, randomUUID } from 'node:crypto';
import { nextScheduleRun } from './timing';
import type { ScheduleClaim, ScheduleRepository, ScheduleSender } from './types';

export type DeliveryErrorKind = 'rate-limit' | 'rejected' | 'not-sent' | 'uncertain';
export class ScheduledDeliveryError extends Error {
  constructor(public kind: DeliveryErrorKind, message: string, public retryAfterMs?: number) {
    super(message); this.name = 'ScheduledDeliveryError';
  }
}

export interface ScheduleRunResult {
  scheduleId: string;
  occurrenceId: string;
  status: 'sent' | 'retrying' | 'failed' | 'uncertain' | 'skipped';
  messageId?: string;
}

/** Discord's nonce is at most 25 characters. Keep it stable across a safe retry. */
export function scheduleNonce(occurrenceId: string): string {
  return createHash('sha256').update('meowhook-schedule:' + occurrenceId).digest('hex').slice(0, 24);
}

export function scheduleRetryDelay(attempt: number, retryAfterMs?: number): number {
  const backoff = Math.min(3_600_000, 30_000 * 2 ** Math.max(0, Math.min(10, attempt - 1)));
  return Number.isFinite(retryAfterMs) ? Math.max(backoff, Math.min(86_400_000, Math.max(1_000, retryAfterMs!))) : backoff;
}

interface RunnerOptions {
  repository: ScheduleRepository;
  send: ScheduleSender;
  now?: () => Date;
  workerId?: string;
  /** One short bounded batch fits a serverless cron invocation. */
  limit?: number;
  leaseMs?: number;
  maxAttempts?: number;
  /** Revalidate the immutable payload and its actions immediately before dispatch. */
  validate?: (claim: ScheduleClaim) => Promise<string | null> | string | null;
}

export async function runScheduledMessages(options: RunnerOptions): Promise<ScheduleRunResult[]> {
  const { repository, send } = options;
  const now = options.now ?? (() => new Date());
  const claimedAt = now();
  const limit = Math.min(10, Math.max(1, Math.floor(options.limit ?? 5)));
  const leaseMs = Math.min(300_000, Math.max(30_000, options.leaseMs ?? 90_000));
  const maxAttempts = Math.min(10, Math.max(1, options.maxAttempts ?? 5));
  const claims = await repository.claimDue({ now: claimedAt.toISOString(),
    leaseUntil: new Date(claimedAt.getTime() + leaseMs).toISOString(), workerId: options.workerId ?? randomUUID(), limit });
  return Promise.all(claims.map(async (claim): Promise<ScheduleRunResult> => {
    const result = (status: ScheduleRunResult['status'], messageId?: string): ScheduleRunResult => ({
      scheduleId: claim.job.id, occurrenceId: claim.occurrenceId, status, ...(messageId ? { messageId } : {}),
    });
    // A stale/revoked claim must not dispatch, even when another worker already has this snapshot.
    if (claim.job.status !== 'active') return result('skipped');
    let started = false;
    let acknowledged = false;
    try {
      const validationError = await options.validate?.(claim);
      if (validationError) {
        await repository.fail(claim, { at: now().toISOString(), error: validationError, uncertain: false });
        return result('failed');
      }
      if (!await repository.beginDelivery(claim, now().toISOString())) return result('skipped');
      started = true;
      const receipt = await send(claim, { nonce: scheduleNonce(claim.occurrenceId), enforceNonce: true });
      if (!receipt || typeof receipt.messageId !== 'string' || !receipt.messageId) {
        throw new ScheduledDeliveryError('uncertain', 'Discord returned no delivery receipt. Check the channel before sending again.');
      }
      acknowledged = true;
      const completedAt = now();
      // Compute from the actual completion time to avoid flooding missed recurring sends after downtime.
      const after = new Date(Math.max(completedAt.getTime(), Date.parse(claim.scheduledFor)));
      const nextRunAt = nextScheduleRun(claim.job.rule, after);
      const saved = await repository.complete(claim, { completedAt: completedAt.toISOString(), messageId: receipt.messageId, nextRunAt });
      if (!saved) {
        // The message exists but its receipt could not be committed. A replacement worker must not POST again.
        await repository.fail(claim, { at: now().toISOString(), error: 'Delivery succeeded but its receipt could not be saved. Check the channel before sending again.', uncertain: true });
        return result('uncertain', receipt.messageId);
      }
      return result('sent', receipt.messageId);
    } catch (error) {
      const typed = error instanceof ScheduledDeliveryError ? error : null;
      const message = error instanceof Error ? error.message : 'Scheduled delivery failed.';
      // A transport timeout or unexpected response after POST may already have created a message.
      // Only explicitly confirmed unsent requests and 429s are safe to retry automatically.
      const safeRetry = !acknowledged && typed && (typed.kind === 'rate-limit' || typed.kind === 'not-sent');
      if (safeRetry && claim.attempt < maxAttempts) {
        const retryAt = new Date(now().getTime() + scheduleRetryDelay(claim.attempt, typed.retryAfterMs)).toISOString();
        await repository.retry(claim, { retryAt, error: message });
        return result('retrying');
      }
      const uncertain = acknowledged || (started && (!typed || typed.kind === 'uncertain'));
      await repository.fail(claim, { at: now().toISOString(), error: message, uncertain });
      return result(uncertain ? 'uncertain' : 'failed');
    }
  }));
}
