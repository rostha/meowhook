import { describe, expect, it } from 'vitest';
import { scheduleDateTimeInput, scheduleDateTimeInstant } from './dashboardDateTime';

describe('dashboard schedule dates in named timezones', () => {
  it('formats and submits Kathmandu time using its 45-minute offset independently of the device timezone', () => {
    const utc = '2026-10-26T06:15:00.000Z';
    expect(scheduleDateTimeInput(utc, 'Asia/Kathmandu')).toBe('2026-10-26T12:00');
    expect(scheduleDateTimeInstant('2026-10-26T12:00', 'Asia/Kathmandu')).toBe(utc);
  });

  it('keeps the date correct across local midnight', () => {
    expect(scheduleDateTimeInput('2026-10-25T18:15:00Z', 'Asia/Kathmandu')).toBe('2026-10-26T00:00');
    expect(scheduleDateTimeInstant('2026-10-26T00:00', 'Asia/Kathmandu')).toBe('2026-10-25T18:15:00.000Z');
  });

  it('converts New York dates with the offset in effect on that date', () => {
    expect(scheduleDateTimeInstant('2026-01-15T12:00', 'America/New_York')).toBe('2026-01-15T17:00:00.000Z');
    expect(scheduleDateTimeInstant('2026-07-15T12:00', 'America/New_York')).toBe('2026-07-15T16:00:00.000Z');
  });

  it('rejects the missing spring-forward hour', () => {
    expect(() => scheduleDateTimeInstant('2026-03-08T02:30', 'America/New_York')).toThrow('skipped or repeated');
  });

  it('rejects the ambiguous fall-back hour instead of silently choosing an occurrence', () => {
    expect(() => scheduleDateTimeInstant('2026-11-01T01:30', 'America/New_York')).toThrow('skipped or repeated');
  });

  it('reinterprets an unchanged visible clock time when a different timezone is selected', () => {
    expect(scheduleDateTimeInstant('2026-10-26T12:00', 'UTC')).toBe('2026-10-26T12:00:00.000Z');
    expect(scheduleDateTimeInstant('2026-10-26T12:00', 'Asia/Kathmandu')).toBe('2026-10-26T06:15:00.000Z');
  });

  it('preserves the precise original instant for an unchanged saved input, including a known repeated-hour occurrence', () => {
    expect(scheduleDateTimeInstant('2026-10-26T12:00', 'Asia/Kathmandu', '2026-10-26T06:15:34.123Z')).toBe('2026-10-26T06:15:34.123Z');
    expect(scheduleDateTimeInstant('2026-11-01T01:30', 'America/New_York', '2026-11-01T06:30:00Z')).toBe('2026-11-01T06:30:00.000Z');
  });

  it('rejects invalid dates and timezone offsets where a named zone is required', () => {
    expect(() => scheduleDateTimeInstant('2026-02-30T12:00', 'UTC')).toThrow('valid date');
    expect(() => scheduleDateTimeInstant('2026-10-26T12:00Z', 'UTC')).toThrow('valid date');
    expect(() => scheduleDateTimeInstant('2026-10-26T12:00', '+05:45')).toThrow('named timezone');
    expect(() => scheduleDateTimeInstant('2026-10-26T12:00', 'Not/A_Zone')).toThrow('not recognised');
  });
});
