'use client';

/**
 * Rate Limit Manager for Discord Webhook Operations
 * 
 * Discord rate limits:
 * - Standard webhooks: 5 requests per 2 seconds per webhook
 * - With attachments: Limited by file size processing time
 * - Global burst: 10 requests per webhook
 * 
 * This module provides:
 * - Rate limit state tracking
 * - Queue management for batch operations
 * - UI state synchronization
 */

export interface RateLimitState {
  isRateLimited: boolean;
  retryAfter: number; // milliseconds until next request is allowed
  remainingRequests: number;
  resetTime: number; // timestamp when limit resets
}

// Global rate limit state
let globalRateLimitState: RateLimitState = {
  isRateLimited: false,
  retryAfter: 0,
  remainingRequests: 5, // Conservative: assume 5 requests per window
  resetTime: 0,
};

// Listeners for state changes
const listeners = new Set<(state: RateLimitState) => void>();
let resetTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleReset() {
  if (resetTimer !== null) clearTimeout(resetTimer);
  resetTimer = null;
  if (!globalRateLimitState.isRateLimited) return;
  const remaining = globalRateLimitState.resetTime - Date.now();
  if (remaining <= 0) { resetRateLimit(); return; }
  resetTimer = setTimeout(() => {
    resetTimer = null;
    // A later response may extend a limit. An old timer must never release it early.
    if (Date.now() >= globalRateLimitState.resetTime) resetRateLimit();
    else scheduleReset();
  }, remaining + 100);
}

/**
 * Subscribe to rate limit state changes
 */
export function subscribeToRateLimit(callback: (state: RateLimitState) => void): () => void {
  listeners.add(callback);
  callback(globalRateLimitState); // Initial state
  return () => listeners.delete(callback);
}

/**
 * Notify all listeners of state change
 */
function notifyListeners() {
  listeners.forEach(cb => cb(globalRateLimitState));
}

/**
 * Update rate limit state from Discord response headers
 */
export function updateRateLimitFromHeaders(headers: Headers): void {
  const remaining = headers.get('X-RateLimit-Remaining');
  const reset = headers.get('X-RateLimit-Reset');
  const resetAfter = headers.get('X-RateLimit-Reset-After');
  const retryAfter = headers.get('Retry-After');
  const retrySeconds = retryAfter === null ? NaN : Number(retryAfter);
  if (Number.isFinite(retrySeconds) && retrySeconds >= 0) {
    // We're currently rate limited
    setRateLimited(retrySeconds * 1000);
    return;
  } else if (remaining && (reset || resetAfter)) {
    // Update from standard rate limit headers
    const remainingNum = Number(remaining);
    const resetTimeMs = resetAfter
      ? Date.now() + Number(resetAfter) * 1000
      : Number(reset) * 1000;
    if (Number.isInteger(remainingNum) && remainingNum >= 0 && Number.isFinite(resetTimeMs)) {
      // A success response already in flight must not clear a newer 429 restriction.
      if (!globalRateLimitState.isRateLimited || Date.now() >= globalRateLimitState.resetTime) {
        globalRateLimitState = {
          isRateLimited: remainingNum === 0,
          retryAfter: Math.max(0, resetTimeMs - Date.now()),
          remainingRequests: remainingNum,
          resetTime: resetTimeMs,
        };
      } else if (remainingNum === 0 && resetTimeMs > globalRateLimitState.resetTime) {
        globalRateLimitState = { isRateLimited: true, retryAfter: resetTimeMs - Date.now(), remainingRequests: 0, resetTime: resetTimeMs };
      }
    }
  }

  notifyListeners();

  scheduleReset();
}

/**
 * Mark that we're rate limited with specific retry time
 */
export function setRateLimited(retryAfterMs: number): void {
  const safeDelay = Number.isFinite(retryAfterMs) ? Math.min(86_400_000, Math.max(0, retryAfterMs)) : 1000;
  const resetTime = Math.max(globalRateLimitState.isRateLimited ? globalRateLimitState.resetTime : 0, Date.now() + safeDelay);
  globalRateLimitState = {
    isRateLimited: true,
    retryAfter: Math.max(0, resetTime - Date.now()),
    remainingRequests: 0,
    resetTime,
  };
  notifyListeners();

  scheduleReset();
}

/**
 * Reset rate limit state
 */
export function resetRateLimit(): void {
  if (resetTimer !== null) clearTimeout(resetTimer);
  resetTimer = null;
  globalRateLimitState = {
    isRateLimited: false,
    retryAfter: 0,
    remainingRequests: 5,
    resetTime: 0,
  };
  notifyListeners();
}

/**
 * Get current rate limit state
 */
export function getRateLimitState(): RateLimitState {
  // Check if we need to auto-reset
  if (globalRateLimitState.isRateLimited && Date.now() >= globalRateLimitState.resetTime) {
    resetRateLimit();
  }
  return globalRateLimitState;
}

/**
 * Check if a request can be made
 */
export function canMakeRequest(): boolean {
  const state = getRateLimitState();
  return !state.isRateLimited && state.remainingRequests > 0;
}

/**
 * Wait until rate limit allows a request
 */
export async function waitForRateLimit(onProgress?: (progress: { status: 'waiting'; isWaiting: true; waitSeconds: number }) => void): Promise<void> {
  for (;;) {
    const state = getRateLimitState();
    if (!state.isRateLimited) return;
    const waitTime = state.resetTime - Date.now();
    if (waitTime <= 0) return;
    // Report rate limit wait
    if (onProgress) {
      onProgress({
        status: 'waiting',
        isWaiting: true,
        waitSeconds: Math.ceil(waitTime / 1000),
      });
    }
    await sleep(waitTime + 100); // Add buffer
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Batch attachment configuration
 */
export const ATTACHMENT_LIMITS = {
  MAX_PER_MESSAGE: 10,
  BATCH_DELAY_MS: 2000, // 2 second gap between batches
  MAX_TOTAL_ATTACHMENTS: 100, // Sanity limit
};

/**
 * Split attachments into batches of 10
 */
export function createAttachmentBatches<T>(attachments: T[]): T[][] {
  if (!attachments || attachments.length === 0) return [];
  
  const batches: T[][] = [];
  for (let i = 0; i < attachments.length; i += ATTACHMENT_LIMITS.MAX_PER_MESSAGE) {
    batches.push(attachments.slice(i, i + ATTACHMENT_LIMITS.MAX_PER_MESSAGE));
  }
  return batches;
}

/**
 * Calculate delay needed before sending next batch
 */
export function calculateBatchDelay(batchIndex: number): number {
  if (batchIndex === 0) return 0;
  // Keep a fixed pause between consecutive batches.
  return ATTACHMENT_LIMITS.BATCH_DELAY_MS;
}

/**
 * Format milliseconds to human readable string
 */
export function formatRetryDelay(ms: number): string {
  if (ms < 1000) return `${Math.ceil(ms / 100) / 10}s`;
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) return `${minutes}m`;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Conservative delay between messages to respect rate limits
 */
export const MESSAGE_SEND_DELAY = 600; // ms between messages
