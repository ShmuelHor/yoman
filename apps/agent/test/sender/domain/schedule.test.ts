import { describe, expect, it } from 'vitest';
import {
  DRAIN_INTERVAL_MS,
  MAX_BACKOFF_MS,
  nextBatchLimit,
  planNextDelayMs,
  SEND_INTERVAL_MS,
} from '../../../src/sender/domain/schedule.js';

const MINUTE = 60_000;
const GATEWAY_RATE_WINDOW_MS = 10_000;
const RETRY_AFTER_MS = 30_000;
const A_DAY_MS = 86_400_000;
const FULL_BATCH = 2_000;
const HALF_BATCH = 1_000;
const REFUSED_SAMPLES = 2_001;
const ODD_BATCH = 7;
const HALF_ODD_BATCH = 3;
describe('planNextDelayMs', () => {
  it('waits the regular minute after a batch that emptied the buffer', () => {
    expect(planNextDelayMs({ kind: 'sent', more: false })).toBe(SEND_INTERVAL_MS);
    expect(SEND_INTERVAL_MS).toBe(MINUTE);
  });

  it('drains a backlog one batch per gateway rate-limit window', () => {
    expect(planNextDelayMs({ kind: 'sent', more: true })).toBe(DRAIN_INTERVAL_MS);
    expect(DRAIN_INTERVAL_MS).toBeGreaterThan(GATEWAY_RATE_WINDOW_MS);
  });

  it('waits the regular minute when nothing was buffered', () => {
    expect(planNextDelayMs({ kind: 'empty' })).toBe(SEND_INTERVAL_MS);
  });

  it('retries a refused size soon', () => {
    expect(planNextDelayMs({ kind: 'too-large', samples: FULL_BATCH })).toBe(DRAIN_INTERVAL_MS);
  });

  it('honors Retry-After on a 429', () => {
    expect(planNextDelayMs({ kind: 'rate-limited', retryAfterMs: RETRY_AFTER_MS })).toBe(
      RETRY_AFTER_MS,
    );
  });

  it('bounds Retry-After between the drain interval and 10 minutes', () => {
    const plan = (retryAfterMs: number | undefined): number =>
      planNextDelayMs({ kind: 'rate-limited', retryAfterMs });
    expect(plan(0)).toBe(DRAIN_INTERVAL_MS);
    expect(plan(undefined)).toBe(DRAIN_INTERVAL_MS);
    expect(plan(A_DAY_MS)).toBe(MAX_BACKOFF_MS);
  });
});

describe('nextBatchLimit', () => {
  it('halves the batch the gateway refused as too large', () => {
    expect(nextBatchLimit(FULL_BATCH, FULL_BATCH, { kind: 'too-large', samples: FULL_BATCH })).toBe(
      HALF_BATCH,
    );
    expect(nextBatchLimit(FULL_BATCH, FULL_BATCH, { kind: 'too-large', samples: ODD_BATCH })).toBe(
      HALF_ODD_BATCH,
    );
  });

  it('never goes below one sample', () => {
    expect(nextBatchLimit(1, FULL_BATCH, { kind: 'too-large', samples: 1 })).toBe(1);
  });

  it('restores the full batch once the gateway takes one', () => {
    expect(nextBatchLimit(HALF_BATCH, FULL_BATCH, { kind: 'sent', more: true })).toBe(FULL_BATCH);
  });

  it.each([
    { kind: 'failed' },
    { kind: 'empty' },
    { kind: 'rate-limited', retryAfterMs: undefined },
  ] as const)('keeps the limit after $kind', (result) => {
    expect(nextBatchLimit(HALF_BATCH, FULL_BATCH, result)).toBe(HALF_BATCH);
  });

  it('is not confused by a refusal bigger than the limit', () => {
    expect(
      nextBatchLimit(FULL_BATCH, FULL_BATCH, { kind: 'too-large', samples: REFUSED_SAMPLES }),
    ).toBe(HALF_BATCH);
  });
});
