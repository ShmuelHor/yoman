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

/** The first retry after a failure waits two intervals; each next one doubles (p-retry `factor`). */
export const BACKOFF_FACTOR = 2;
export const FIRST_BACKOFF_MS = SEND_INTERVAL_MS * BACKOFF_FACTOR;
const SHRINK_FACTOR = 2;

/** What one attempt ended in, as far as scheduling cares. */
export type AttemptResult =
  /** The gateway took the batch. `more` means the buffer still holds a backlog. */
  | { readonly kind: 'sent'; readonly more: boolean }
  /** Nothing was buffered. */
  | { readonly kind: 'empty' }
  /** The gateway refused a body this big (413): retry soon with fewer than `samples`. */
  | { readonly kind: 'too-large'; readonly samples: number }
  /** The gateway asked to slow down; `retryAfterMs` comes from its `Retry-After`. */
  | { readonly kind: 'rate-limited'; readonly retryAfterMs: number | undefined }
  /** Unreachable, timed out or refused: the samples stay buffered. */
  | { readonly kind: 'failed' };

/**
 * An attempt the gateway answered, or that found nothing to send. Failures are
 * not here: the sender retries them with p-retry's exponential backoff
 * (120 s, 240 s, 480 s, then 10 min) before it plans anything.
 */
export type AnsweredAttempt = Exclude<AttemptResult, { readonly kind: 'failed' }>;

function clampRetryAfter(retryAfterMs: number | undefined): number {
  if (retryAfterMs === undefined) {
    return DRAIN_INTERVAL_MS;
  }
  return Math.min(Math.max(retryAfterMs, DRAIN_INTERVAL_MS), MAX_BACKOFF_MS);
}

/** How long to wait before the next regular attempt. */
export function planNextDelayMs(result: AnsweredAttempt): number {
  switch (result.kind) {
    case 'sent':
      return result.more ? DRAIN_INTERVAL_MS : SEND_INTERVAL_MS;
    case 'empty':
      return SEND_INTERVAL_MS;
    case 'too-large':
      return DRAIN_INTERVAL_MS;
    case 'rate-limited':
      // A 429 means the gateway is up and answering: honor its Retry-After.
      return clampRetryAfter(result.retryAfterMs);
  }
}

/**
 * The most samples to read for the next batch. A 413 halves the batch that
 * was refused; a batch the gateway took restores the full size.
 */
export function nextBatchLimit(limit: number, maxLimit: number, result: AttemptResult): number {
  switch (result.kind) {
    case 'too-large':
      return Math.max(1, Math.floor(result.samples / SHRINK_FACTOR));
    case 'sent':
      return maxLimit;
    default:
      return limit;
  }
}
