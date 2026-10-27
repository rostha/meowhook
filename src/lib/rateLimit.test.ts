import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRateLimitState, resetRateLimit, setRateLimited, updateRateLimitFromHeaders, waitForRateLimit } from './rateLimit';

describe('rate limit lifecycle', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T09:00:00Z')); resetRateLimit(); });
  afterEach(() => { resetRateLimit(); vi.useRealTimers(); });
  it('honors fractional retry-after seconds', () => {
    updateRateLimitFromHeaders(new Headers({ 'Retry-After': '0.75' }));
    expect(getRateLimitState().retryAfter).toBe(750);
    vi.advanceTimersByTime(500);
    expect(getRateLimitState().isRateLimited).toBe(true);
    vi.advanceTimersByTime(250);
    expect(getRateLimitState().isRateLimited).toBe(false);
  });
  it('does not let an old short timer clear a newer long restriction', () => {
    setRateLimited(500);
    vi.advanceTimersByTime(200);
    setRateLimited(5000);
    vi.advanceTimersByTime(1000);
    expect(getRateLimitState().isRateLimited).toBe(true);
    expect(getRateLimitState().resetTime).toBe(Date.parse('2026-10-26T09:00:05.200Z'));
    vi.advanceTimersByTime(4000);
    expect(getRateLimitState().isRateLimited).toBe(false);
  });
  it('preserves a newer 429 when an older success response arrives', () => {
    setRateLimited(5000);
    updateRateLimitFromHeaders(new Headers({ 'X-RateLimit-Remaining': '4', 'X-RateLimit-Reset-After': '1' }));
    expect(getRateLimitState()).toMatchObject({ isRateLimited: true, remainingRequests: 0, retryAfter: 5000 });
  });
  it('accepts fractional standard reset times and ignores malformed header values', () => {
    updateRateLimitFromHeaders(new Headers({ 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset-After': '0.25' }));
    expect(getRateLimitState().retryAfter).toBe(250);
    updateRateLimitFromHeaders(new Headers({ 'Retry-After': 'not-a-number', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset-After': 'broken' }));
    expect(getRateLimitState().retryAfter).toBe(250);
    vi.advanceTimersByTime(300);
    expect(getRateLimitState().isRateLimited).toBe(false);
  });
  it('rechecks a restriction extended while waiting', async () => {
    setRateLimited(500);
    let resumed = false;
    const waiting = waitForRateLimit().then(() => { resumed = true; });
    await vi.advanceTimersByTimeAsync(200);
    setRateLimited(1500);
    await vi.advanceTimersByTimeAsync(500);
    expect(resumed).toBe(false);
    await vi.advanceTimersByTimeAsync(1100);
    await waiting;
    expect(resumed).toBe(true);
  });
  it('reset cancels the pending timer and does not clear subsequent state', () => {
    setRateLimited(500); resetRateLimit(); setRateLimited(5000);
    vi.advanceTimersByTime(1000);
    expect(getRateLimitState().isRateLimited).toBe(true);
  });
});
