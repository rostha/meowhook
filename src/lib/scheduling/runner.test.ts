import { describe, expect, it, vi } from 'vitest';
import { runScheduledMessages, ScheduledDeliveryError, scheduleNonce, scheduleRetryDelay } from './runner';
import type { ScheduleClaim, ScheduleRepository } from './types';

const now = () => new Date('2026-10-26T09:00:00Z');
function claim(): ScheduleClaim {
  return { occurrenceId: 'occurrence-1', scheduledFor: '2026-10-26T08:00:00Z', leaseToken: 'token', attempt: 1,
    job: { id: 'schedule-1', ownerId: 'owner-1', messageId: 'message-1', guildId: 'guild-1', channelId: 'channel-1',
      payload: { content: 'hello' }, actionIds: [], status: 'active', revision: 1, attempts: 0,
      rule: { frequency: 'daily', timezone: 'UTC', localTime: '08:00', startsAt: '2026-01-01T00:00:00Z' },
      nextRunAt: '2026-10-26T08:00:00Z', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } };
}
function repo(record = claim()): ScheduleRepository {
  return { claimDue: vi.fn().mockResolvedValue([record]), beginDelivery: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(true), retry: vi.fn().mockResolvedValue(true), fail: vi.fn().mockResolvedValue(true) };
}

describe('durable scheduled delivery worker', () => {
  it('sends with a stable nonce and persists the receipt before advancing the recurrence', async () => {
    const record = claim(); const repository = repo(record); const send = vi.fn().mockResolvedValue({ messageId: 'discord-1' });
    expect(await runScheduledMessages({ repository, send, now })).toEqual([{ scheduleId: 'schedule-1', occurrenceId: 'occurrence-1', status: 'sent', messageId: 'discord-1' }]);
    expect(send).toHaveBeenCalledWith(record, { nonce: scheduleNonce('occurrence-1'), enforceNonce: true });
    expect(repository.complete).toHaveBeenCalledWith(record, { completedAt: now().toISOString(), messageId: 'discord-1', nextRunAt: '2026-10-27T08:00:00.000Z' });
    expect(vi.mocked(repository.beginDelivery).mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]);
    expect(send.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(repository.complete).mock.invocationCallOrder[0]);
  });
  it('finishes a one-time schedule instead of rescheduling it', async () => {
    const record = claim(); record.job.rule.frequency = 'once'; const repository = repo(record);
    await runScheduledMessages({ repository, send: async () => ({ messageId: 'one' }), now });
    expect(repository.complete).toHaveBeenCalledWith(record, expect.objectContaining({ nextRunAt: null }));
  });
  it('never sends stale, cancelled, or paused claims', async () => {
    const record = claim(); const repository = repo(record); vi.mocked(repository.beginDelivery).mockResolvedValue(false);
    const send = vi.fn();
    expect((await runScheduledMessages({ repository, send, now }))[0].status).toBe('skipped');
    for (const status of ['paused', 'cancelled', 'completed'] as const) {
      record.job.status = status;
      expect((await runScheduledMessages({ repository, send, now }))[0].status).toBe('skipped');
    }
    expect(send).not.toHaveBeenCalled();
  });
  it('revalidates before beginning delivery', async () => {
    const repository = repo(); const send = vi.fn();
    const results = await runScheduledMessages({ repository, send, now, validate: () => 'The role menu was deleted.' });
    expect(results[0].status).toBe('failed');
    expect(repository.beginDelivery).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ error: 'The role menu was deleted.', uncertain: false }));
  });
  it('retries a confirmed 429 using retry_after and never loops in one invocation', async () => {
    const repository = repo(); const send = vi.fn().mockRejectedValue(new ScheduledDeliveryError('rate-limit', 'Wait', 120_000));
    expect((await runScheduledMessages({ repository, send, now }))[0].status).toBe('retrying');
    expect(repository.retry).toHaveBeenCalledWith(expect.anything(), { retryAt: '2026-10-26T09:02:00.000Z', error: 'Wait' });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('retries only explicitly unsent failures, then exhausts bounded attempts', async () => {
    const record = claim(); record.attempt = 5; const repository = repo(record);
    const send = vi.fn().mockRejectedValue(new ScheduledDeliveryError('not-sent', 'Not sent'));
    expect((await runScheduledMessages({ repository, send, now }))[0].status).toBe('failed');
    expect(repository.retry).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(record, expect.objectContaining({ uncertain: false }));
  });
  it.each([new Error('Connection closed'), new ScheduledDeliveryError('uncertain', 'Discord may have accepted the message')])('never automatically retries ambiguous POST failures', async error => {
    const repository = repo();
    expect((await runScheduledMessages({ repository, send: async () => { throw error; }, now }))[0].status).toBe('uncertain');
    expect(repository.retry).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ uncertain: true }));
  });
  it('does not retry a rejected payload', async () => {
    const repository = repo();
    expect((await runScheduledMessages({ repository, send: async () => { throw new ScheduledDeliveryError('rejected', 'No permission'); }, now }))[0].status).toBe('failed');
    expect(repository.retry).not.toHaveBeenCalled();
  });
  it('marks lost receipt persistence as uncertain without sending twice', async () => {
    const repository = repo(); vi.mocked(repository.complete).mockRejectedValue(new Error('Database offline'));
    const send = vi.fn().mockResolvedValue({ messageId: 'exists' });
    expect((await runScheduledMessages({ repository, send, now }))[0].status).toBe('uncertain');
    expect(send).toHaveBeenCalledTimes(1);
    expect(repository.retry).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ uncertain: true }));
  });
  it('marks a missing receipt or obsolete lease as uncertain', async () => {
    const repository = repo(); vi.mocked(repository.complete).mockResolvedValue(false);
    const send = vi.fn().mockResolvedValue({ messageId: 'exists' });
    expect((await runScheduledMessages({ repository, send, now }))[0]).toMatchObject({ status: 'uncertain', messageId: 'exists' });
    const noReceipt = repo();
    expect((await runScheduledMessages({ repository: noReceipt, send: async () => ({ messageId: '' }), now }))[0].status).toBe('uncertain');
  });
  it('passes a bounded lease and claim limit to the durable store', async () => {
    const repository = repo(); vi.mocked(repository.claimDue).mockResolvedValue([]);
    await runScheduledMessages({ repository, send: vi.fn(), now, limit: 1000, leaseMs: 1, workerId: 'worker-1' });
    expect(repository.claimDue).toHaveBeenCalledWith({ now: now().toISOString(), leaseUntil: '2026-10-26T09:00:30.000Z', workerId: 'worker-1', limit: 10 });
  });
  it('produces bounded backoff and a 24-character unique stable nonce', () => {
    expect(scheduleRetryDelay(1)).toBe(30_000);
    expect(scheduleRetryDelay(3)).toBe(120_000);
    expect(scheduleRetryDelay(100)).toBe(3_600_000);
    expect(scheduleRetryDelay(1, Infinity)).toBe(30_000);
    expect(scheduleNonce('one')).toHaveLength(24);
    expect(scheduleNonce('one')).toBe(scheduleNonce('one'));
    expect(scheduleNonce('two')).not.toBe(scheduleNonce('one'));
  });
});
