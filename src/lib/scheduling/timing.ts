import { Temporal } from '@js-temporal/polyfill';
import type { ScheduledJob, ScheduleRule } from './types';

export class ScheduleValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ScheduleValidationError'; }
}

function instant(value: unknown, label: string): Temporal.Instant {
  if (typeof value !== 'string') throw new ScheduleValidationError(`${label} needs a date and time.`);
  try {
    const parsed = Temporal.Instant.from(value);
    if (!Number.isFinite(new Date(parsed.epochMilliseconds).getTime())) throw new Error('Out of range');
    return parsed;
  }
  catch { throw new ScheduleValidationError(`${label} needs a valid ISO date and time with a UTC offset.`); }
}

/** Fixed millisecond precision keeps SQL text timestamps in chronological order. */
function iso(value: Temporal.Instant): string { return new Date(value.epochMilliseconds).toISOString(); }

export function validateScheduleRule(value: unknown): ScheduleRule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ScheduleValidationError('Choose a schedule.');
  const rule = value as Record<string, unknown>;
  if (!['once', 'daily', 'weekly'].includes(String(rule.frequency))) throw new ScheduleValidationError('Choose once, daily or weekly.');
  if (typeof rule.timezone !== 'string' || !rule.timezone || rule.timezone.length > 100 || /^[+-]/.test(rule.timezone)) {
    throw new ScheduleValidationError('Choose a named timezone, such as Asia/Kathmandu.');
  }
  try { Temporal.Now.zonedDateTimeISO(rule.timezone); }
  catch { throw new ScheduleValidationError('This timezone is not recognised.'); }
  if (typeof rule.localTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(rule.localTime)) {
    throw new ScheduleValidationError('Choose a valid time in HH:mm format.');
  }
  const start = instant(rule.startsAt, 'Start time');
  const end = rule.endsAt === undefined || rule.endsAt === '' ? undefined : instant(rule.endsAt, 'End time');
  if (end && Temporal.Instant.compare(end, start) < 0) throw new ScheduleValidationError('End time must be after the start time.');
  let weekdays: number[] | undefined;
  if (rule.frequency === 'weekly') {
    if (!Array.isArray(rule.weekdays) || !rule.weekdays.length || rule.weekdays.length > 7 ||
      !rule.weekdays.every(day => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6)) {
      throw new ScheduleValidationError('Choose at least one day of the week.');
    }
    weekdays = [...new Set(rule.weekdays as number[])].sort((a, b) => a - b);
  }
  return {
    frequency: rule.frequency as ScheduleRule['frequency'], timezone: rule.timezone, localTime: rule.localTime,
    ...(weekdays ? { weekdays } : {}), startsAt: iso(start), ...(end ? { endsAt: iso(end) } : {}),
  };
}

/**
 * The next occurrence strictly after `after`, or inclusive when creating a schedule.
 * DST gaps are skipped. A repeated wall time runs once, at the earlier occurrence.
 * Missed occurrences are skipped rather than sent in a burst after downtime.
 */
export function nextScheduleRun(input: ScheduleRule, after: string | Date, inclusive = false): string | null {
  const rule = validateScheduleRule(input);
  const cursor = instant(after instanceof Date ? after.toISOString() : after, 'Reference time');
  const start = Temporal.Instant.from(rule.startsAt);
  const end = rule.endsAt ? Temporal.Instant.from(rule.endsAt) : null;
  const eligible = (candidate: Temporal.Instant) => Temporal.Instant.compare(candidate, start) >= 0 &&
    Temporal.Instant.compare(candidate, cursor) >= (inclusive ? 0 : 1) && (!end || Temporal.Instant.compare(candidate, end) <= 0);
  if (rule.frequency === 'once') return eligible(start) ? iso(start) : null;
  const lowerBound = Temporal.Instant.compare(start, cursor) > 0 ? start : cursor;
  if (end && Temporal.Instant.compare(lowerBound, end) > 0) return null;
  let date = lowerBound.toZonedDateTimeISO(rule.timezone).toPlainDate();
  const [hour, minute] = rule.localTime.split(':').map(Number);
  // A weekly recurrence needs at most two weeks if a DST gap skips one occurrence.
  for (let i = 0; i < 16; i++, date = date.add({ days: 1 })) {
    if (rule.frequency === 'weekly' && !rule.weekdays!.includes(date.dayOfWeek % 7)) continue;
    const zoned = Temporal.ZonedDateTime.from({ year: date.year, month: date.month, day: date.day,
      hour, minute, timeZone: rule.timezone }, { disambiguation: 'earlier' });
    // "earlier" resolves a nonexistent time backwards. Skip it rather than changing the wall time.
    if (zoned.year !== date.year || zoned.month !== date.month || zoned.day !== date.day || zoned.hour !== hour || zoned.minute !== minute) continue;
    const candidate = zoned.toInstant();
    if (eligible(candidate)) return iso(candidate);
    if (end && Temporal.Instant.compare(candidate, end) > 0) return null;
  }
  return null;
}

export function requireNextScheduleRun(rule: ScheduleRule, now = new Date()): string {
  const next = nextScheduleRun(rule, now, true);
  if (!next) throw new ScheduleValidationError('Choose a future delivery time within the schedule dates.');
  return next;
}

export function transitionSchedule(job: ScheduledJob, action: 'pause' | 'resume' | 'cancel', now = new Date()): ScheduledJob {
  const updatedAt = now.toISOString();
  if (action === 'cancel') {
    if (job.status === 'completed') throw new ScheduleValidationError('This schedule has already finished.');
    return { ...job, status: 'cancelled', revision: job.revision + 1, updatedAt };
  }
  if (action === 'pause') {
    if (job.status !== 'active') throw new ScheduleValidationError('Only an active schedule can be paused.');
    return { ...job, status: 'paused', revision: job.revision + 1, updatedAt };
  }
  if (job.status !== 'paused') throw new ScheduleValidationError('Only a paused schedule can be resumed.');
  return { ...job, status: 'active', nextRunAt: requireNextScheduleRun(job.rule, now), revision: job.revision + 1, updatedAt };
}
