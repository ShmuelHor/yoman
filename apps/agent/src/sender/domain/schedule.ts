/**
 * When the sender tries next (SPEC §4.3). Pure, so every path of the policy
 * is unit-tested without timers.
 */

/** SPEC §4.3: a batch every 60 s. */
export const SEND_INTERVAL_MS = 60_000;
/** SPEC §4.3: backoff grows up to 10 min. */
export const MAX_BACKOFF_MS = 600_000;
/**
 * The gateway accepts one ingest per 10 s (SECURITY A17). A backlog drains one
 * batch per window, with a second of slack so the next batch never lands a 429.
 */
export const DRAIN_INTERVAL_MS = 11_000;

const BACKOFF_FACTOR = 2;

/** What one attempt ended in, as far as scheduling cares. */
export type AttemptResult =
  /** The gateway took the batch. `more` means the buffer still holds a backlog. */
  | { readonly kind: 'sent'; readonly more: boolean }
  /** Nothing was buffered. */
  | { readonly kind: 'empty' }
  /** The gateway asked to slow down; `retryAfterMs` comes from its `Retry-After`. */
  | { readonly kind: 'rate-limited'; readonly retryAfterMs: number | undefined }
  /** Unreachable, timed out or refused: the samples stay buffered. */
  | { readonly kind: 'failed' };

export interface SendPlan {
  /** Consecutive failures so far; it drives the backoff. */
  readonly failures: number;
  readonly delayMs: number;
}

/** The delay after `failures` consecutive failures: 120 s, 240 s, 480 s, then 10 min. */
export function backoffDelayMs(failures: number): number {
  const delay = SEND_INTERVAL_MS * BACKOFF_FACTOR ** failures;
  return Math.min(delay, MAX_BACKOFF_MS);
}

function clampRetryAfter(retryAfterMs: number | undefined): number {
  if (retryAfterMs === undefined) {
    return DRAIN_INTERVAL_MS;
  }
  return Math.min(Math.max(retryAfterMs, DRAIN_INTERVAL_MS), MAX_BACKOFF_MS);
}

/** The next attempt, given how the last one went and the failures before it. */
export function planNext(failures: number, result: AttemptResult): SendPlan {
  switch (result.kind) {
    case 'sent':
      return { failures: 0, delayMs: result.more ? DRAIN_INTERVAL_MS : SEND_INTERVAL_MS };
    case 'empty':
      return { failures: 0, delayMs: SEND_INTERVAL_MS };
    case 'rate-limited':
      // A 429 means the gateway is up and answering: no reason to grow the backoff.
      return { failures, delayMs: clampRetryAfter(result.retryAfterMs) };
    case 'failed': {
      const next = failures + 1;
      return { failures: next, delayMs: backoffDelayMs(next) };
    }
  }
}
