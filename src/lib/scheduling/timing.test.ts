import { describe, expect, it } from 'vitest';
import { nextScheduleRun, requireNextScheduleRun, transitionSchedule, validateScheduleRule } from './timing';
import type { ScheduledJob, ScheduleRule } from './types';

const daily = (overrides: Partial<ScheduleRule> = {}): ScheduleRule => ({
  frequency: 'daily', timezone: 'UTC', localTime: '09:00', startsAt: '2026-01-01T00:00:00.000Z', ...overrides,
});

describe('schedule rules and calendar recurrence', () => {
  it('normalizes instants and de-duplicates weekly days', () => {
    expect(validateScheduleRule(daily({ frequency: 'weekly', weekdays: [6, 1, 1], startsAt: '2026-01-01T05:45:00+05:45' })))
      .toMatchObject({ weekdays: [1, 6], startsAt: '2026-01-01T00:00:00.000Z' });
  });
  it.each([
    { frequency: 'hourly' }, { timezone: 'Unreal/City' }, { timezone: '+05:45' }, { localTime: '24:00' },
    { localTime: '9:00' }, { startsAt: '2026-01-01T09:00' }, { endsAt: '2025-01-01T00:00:00.000Z' },
    { frequency: 'weekly', weekdays: [] }, { frequency: 'weekly', weekdays: [7] }, { frequency: 'weekly', weekdays: [1.5] },
  ])('rejects invalid rule %j', (changes) => {
    expect(() => validateScheduleRule({ ...daily(), ...changes })).toThrow();
  });
  it('delivers once, permits exact creation time, and rejects past one-time schedules', () => {
    const once = daily({ frequency: 'once', startsAt: '2026-10-26T09:00:00.000Z' });
    expect(nextScheduleRun(once, '2026-10-26T08:59:00.000Z')).toBe('2026-10-26T09:00:00.000Z');
    expect(nextScheduleRun(once, '2026-10-26T09:00:00.000Z')).toBeNull();
    expect(requireNextScheduleRun(once, new Date('2026-10-26T09:00:00.000Z'))).toBe('2026-10-26T09:00:00.000Z');
    expect(() => requireNextScheduleRun(once, new Date('2026-10-26T09:01:00.000Z'))).toThrow('future');
  });
  it('honors a quarter-hour timezone and skips missed daily occurrences', () => {
    const kathmandu = daily({ timezone: 'Asia/Kathmandu', localTime: '08:00' });
    expect(nextScheduleRun(kathmandu, '2026-10-26T02:15:00.000Z')).toBe('2026-10-27T02:15:00.000Z');
    expect(nextScheduleRun(kathmandu, '2026-10-26T02:14:00.000Z')).toBe('2026-10-26T02:15:00.000Z');
  });
  it('keeps New York wall time through DST without fixed UTC interval drift', () => {
    const ny = daily({ timezone: 'America/New_York' });
    expect(nextScheduleRun(ny, '2026-03-07T14:00:00.000Z')).toBe('2026-03-08T13:00:00.000Z');
    expect(nextScheduleRun(ny, '2026-10-31T13:00:00.000Z')).toBe('2026-11-01T14:00:00.000Z');
  });
  it('skips a missing spring-forward time', () => {
    const ny = daily({ timezone: 'America/New_York', localTime: '02:30' });
    expect(nextScheduleRun(ny, '2026-03-07T07:30:00.000Z')).toBe('2026-03-09T06:30:00.000Z');
  });
  it('runs a repeated fall-back time only once at its first occurrence', () => {
    const ny = daily({ timezone: 'America/New_York', localTime: '01:30' });
    expect(nextScheduleRun(ny, '2026-11-01T05:29:00.000Z')).toBe('2026-11-01T05:30:00.000Z');
    expect(nextScheduleRun(ny, '2026-11-01T05:30:00.000Z')).toBe('2026-11-02T06:30:00.000Z');
    expect(nextScheduleRun(ny, '2026-11-01T06:00:00.000Z')).toBe('2026-11-02T06:30:00.000Z');
  });
  it('handles a half-hour DST gap and a skipped calendar day', () => {
    expect(nextScheduleRun(daily({ timezone: 'Australia/Lord_Howe', localTime: '02:15' }), '2026-10-03T00:00:00.000Z'))
      .toBe('2026-10-04T15:15:00.000Z');
    expect(nextScheduleRun(daily({ timezone: 'Pacific/Apia', localTime: '12:00', startsAt: '2011-12-29T00:00:00.000Z' }), '2011-12-29T22:00:00.000Z'))
      .toBe('2011-12-30T22:00:00.000Z');
  });
  it('supports Sunday-based weekdays and skips the DST gap for weekly schedules', () => {
    const sunday = daily({ frequency: 'weekly', weekdays: [0], timezone: 'America/New_York', localTime: '02:30' });
    expect(nextScheduleRun(sunday, '2026-03-01T07:30:00.000Z')).toBe('2026-03-15T06:30:00.000Z');
  });
  it('honors future starts, inclusive ends, and exhausted ranges', () => {
    const range = daily({ startsAt: '2026-10-29T10:00:00.000Z', endsAt: '2026-10-30T09:00:00.000Z' });
    expect(nextScheduleRun(range, '2026-10-26T00:00:00.000Z')).toBe('2026-10-30T09:00:00.000Z');
    expect(nextScheduleRun(range, '2026-10-30T09:00:00.000Z')).toBeNull();
    expect(nextScheduleRun(range, '2026-11-30T00:00:00.000Z')).toBeNull();
  });
});

describe('schedule status transitions', () => {
  const job = (): ScheduledJob => ({ id: 'job', ownerId: 'owner', messageId: 'message', guildId: 'guild', channelId: 'channel',
    payload: { content: 'hello' }, actionIds: [], rule: daily(), nextRunAt: '2026-10-25T09:00:00.000Z', status: 'active',
    revision: 1, attempts: 0, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });
  it('pauses and resumes without catching up old deliveries', () => {
    const paused = transitionSchedule(job(), 'pause', new Date('2026-10-26T10:00:00.000Z'));
    expect(paused.status).toBe('paused');
    const resumed = transitionSchedule(paused, 'resume', new Date('2026-10-26T10:01:00.000Z'));
    expect(resumed).toMatchObject({ status: 'active', revision: 3, nextRunAt: '2026-10-27T09:00:00.000Z' });
  });
  it('does not resume cancelled, failed or completed deliveries, or an expired one-time schedule', () => {
    for (const status of ['active', 'cancelled', 'failed', 'completed'] as const) {
      expect(() => transitionSchedule({ ...job(), status }, 'resume')).toThrow('paused');
    }
    expect(() => transitionSchedule({ ...job(), status: 'paused', rule: daily({ frequency: 'once' }) }, 'resume', new Date('2026-10-26T10:00:00.000Z'))).toThrow('future');
  });
});
