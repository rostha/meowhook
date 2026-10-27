/** A recurrence uses the named timezone's wall clock, rather than a fixed UTC offset. */
export interface ScheduleRule {
  frequency: 'once' | 'daily' | 'weekly';
  timezone: string;
  localTime: string;
  /** Sunday = 0, Saturday = 6. Required for a weekly recurrence. */
  weekdays?: number[];
  /** An ISO instant. For once this is the delivery time; otherwise it is an inclusive lower bound. */
  startsAt: string;
  endsAt?: string;
}

export type ScheduleStatus = 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';

export interface ScheduledJob {
  id: string;
  ownerId: string;
  messageId: string;
  guildId: string;
  channelId: string;
  /** Immutable message snapshot: later editor changes cannot silently change a scheduled send. */
  payload: Record<string, unknown>;
  actionIds: string[];
  rule: ScheduleRule;
  nextRunAt: string;
  status: ScheduleStatus;
  revision: number;
  attempts: number;
  lastError?: string;
  lastErrorKind?: 'rejected' | 'exhausted' | 'uncertain';
  lastRunAt?: string;
  lastMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleClaim {
  job: ScheduledJob;
  /** Stable for this occurrence across safe retries. */
  occurrenceId: string;
  scheduledFor: string;
  leaseToken: string;
  /** Starts at one. A new recurrence resets the attempt count. */
  attempt: number;
}

/**
 * Implement each method as an atomic database mutation conditioned on leaseToken.
 * Never implement this repository using in-memory locks or ephemeral function files.
 */
export interface ScheduleRepository {
  /**
   * Claim active due jobs atomically. Expired claims that never reached beginDelivery may
   * be reclaimed; expired 'sending' claims must become uncertain, never sent again.
   */
  claimDue(input: { now: string; leaseUntil: string; workerId: string; limit: number }): Promise<ScheduleClaim[]>;
  /** Check current active status, revision, token and unexpired lease; durably mark sending. */
  beginDelivery(claim: ScheduleClaim, now: string): Promise<boolean>;
  /** Record receipt and advance recurrence atomically; preserve a concurrent pause/cancel. */
  complete(claim: ScheduleClaim, result: { completedAt: string; messageId: string; nextRunAt: string | null }): Promise<boolean>;
  retry(claim: ScheduleClaim, result: { retryAt: string; error: string }): Promise<boolean>;
  fail(claim: ScheduleClaim, result: { at: string; error: string; uncertain: boolean }): Promise<boolean>;
}

export type ScheduleSender = (
  claim: ScheduleClaim,
  options: { nonce: string; enforceNonce: true },
) => Promise<{ messageId: string }>;
