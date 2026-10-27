import { Temporal } from '@js-temporal/polyfill';

export class ScheduleDateTimeError extends Error {
  constructor(message: string) { super(message); this.name = 'ScheduleDateTimeError'; }
}

function assertNamedTimezone(timezone: string): void {
  if (!timezone || timezone.length > 100 || /^[+-]/.test(timezone)) {
    throw new ScheduleDateTimeError('Choose a named timezone, such as Asia/Kathmandu.');
  }
  try { Temporal.Instant.from('2000-01-01T00:00:00Z').toZonedDateTimeISO(timezone); }
  catch { throw new ScheduleDateTimeError('This timezone is not recognised.'); }
}

/** datetime-local holds wall-clock text with no zone. Always format it in the selected named zone. */
export function scheduleDateTimeInput(instant: string, timezone: string): string {
  assertNamedTimezone(timezone);
  try { return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDateTime().toString({ smallestUnit: 'minute' }); }
  catch { throw new ScheduleDateTimeError('Choose a valid date and time.'); }
}

/** Reject both clock gaps and repeated hours rather than choosing a surprising delivery instant. */
export function scheduleDateTimeInstant(value: string, timezone: string, unchangedInstant?: string): string {
  assertNamedTimezone(timezone);
  if (unchangedInstant && scheduleDateTimeInput(unchangedInstant, timezone) === value) {
    return Temporal.Instant.from(unchangedInstant).toString({ smallestUnit: 'millisecond' });
  }
  let local: Temporal.PlainDateTime;
  try {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) throw new Error();
    local = Temporal.PlainDateTime.from(value, { overflow: 'reject' });
  } catch { throw new ScheduleDateTimeError('Choose a valid date and time.'); }
  try {
    return local.toZonedDateTime(timezone, { disambiguation: 'reject' }).toInstant().toString({ smallestUnit: 'millisecond' });
  } catch {
    throw new ScheduleDateTimeError(`This local time is skipped or repeated by a clock change in ${timezone}. Choose a different time.`);
  }
}
