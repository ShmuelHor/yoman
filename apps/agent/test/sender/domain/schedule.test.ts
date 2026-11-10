import { describe, expect, it } from 'vitest';
import {
  backoffDelayMs,
  DRAIN_INTERVAL_MS,
  MAX_BACKOFF_MS,
  planNext,
  SEND_INTERVAL_MS,
} from '../../../src/sender/domain/schedule.js';

const MINUTE = 60_000;
const TWO_MINUTES = 120_000;
const FOUR_MINUTES = 240_000;
const EIGHT_MINUTES = 480_000;
const TEN_MINUTES = 600_000;
const GATEWAY_RATE_WINDOW_MS = 10_000;
const RETRY_AFTER_MS = 30_000;
const A_DAY_MS = 86_400_000;
const SOME_FAILURES = 2;
const MANY_FAILURES = 1_000;
/** The backoff after each of six consecutive failures. */
const BACKOFF_MS = [
  TWO_MINUTES,
  FOUR_MINUTES,
  EIGHT_MINUTES,
  TEN_MINUTES,
  TEN_MINUTES,
  TEN_MINUTES,
];

describe('backoffDelayMs', () => {
  it('doubles from the send interval, then stays at 10 minutes', () => {
    const failures = BACKOFF_MS.map((_, index) => index + 1);
    expect(failures.map(backoffDelayMs)).toEqual(BACKOFF_MS);
  });

  it('never waits longer than the cap', () => {
    expect(backoffDelayMs(MANY_FAILURES)).toBe(MAX_BACKOFF_MS);
  });
});

describe('planNext', () => {
  it('waits the regular minute after a batch that emptied the buffer', () => {
    expect(planNext(SOME_FAILURES, { kind: 'sent', more: false })).toEqual({
      failures: 0,
      delayMs: SEND_INTERVAL_MS,
    });
    expect(SEND_INTERVAL_MS).toBe(MINUTE);
  });

  it('drains a backlog one batch per gateway rate-limit window', () => {
    expect(planNext(0, { kind: 'sent', more: true })).toEqual({
      failures: 0,
      delayMs: DRAIN_INTERVAL_MS,
    });
    expect(DRAIN_INTERVAL_MS).toBeGreaterThan(GATEWAY_RATE_WINDOW_MS);
  });

  it('waits the regular minute when nothing was buffered', () => {
    expect(planNext(SOME_FAILURES, { kind: 'empty' })).toEqual({
      failures: 0,
      delayMs: SEND_INTERVAL_MS,
    });
  });

  it('backs off exponentially while sending keeps failing', () => {
    let failures = 0;
    const delays: number[] = [];
    for (const _ of BACKOFF_MS) {
      const plan = planNext(failures, { kind: 'failed' });
      failures = plan.failures;
      delays.push(plan.delayMs);
    }
    expect(delays).toEqual(BACKOFF_MS);
  });

  it('honors Retry-After on a 429 without growing the backoff', () => {
    expect(planNext(SOME_FAILURES, { kind: 'rate-limited', retryAfterMs: RETRY_AFTER_MS })).toEqual(
      { failures: SOME_FAILURES, delayMs: RETRY_AFTER_MS },
    );
  });

  it('bounds Retry-After between the drain interval and 10 minutes', () => {
    const plan = (retryAfterMs: number | undefined): number =>
      planNext(0, { kind: 'rate-limited', retryAfterMs }).delayMs;
    expect(plan(0)).toBe(DRAIN_INTERVAL_MS);
    expect(plan(undefined)).toBe(DRAIN_INTERVAL_MS);
    expect(plan(A_DAY_MS)).toBe(MAX_BACKOFF_MS);
  });
});
