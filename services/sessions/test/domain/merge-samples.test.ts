import { describe, expect, it } from 'vitest';

import {
  type ActivitySample,
  IDLE_THRESHOLD_MS,
  MAX_GAP_MS,
  mergeSamples,
  type Span,
} from '../../src/domain/merge-samples.js';

const SAMPLE_INTERVAL_MS = 5_000;
const RUN_LENGTH = 13;

/** A wall-clock time on the fixture day, `HH:MM:SS` in UTC. */
function at(clock: string): number {
  return Date.parse(`2026-11-08T${clock}.000Z`);
}

function sample(
  clock: string,
  appId = 'code',
  extra: Partial<ActivitySample> = {},
): ActivitySample {
  return { tsMs: at(clock), appId, title: null, idleMs: 0, locked: false, ...extra };
}

/** One sample every 5 s, from `from` up to and including `to`. */
function run(from: string, to: string, appId = 'code'): ActivitySample[] {
  const samples: ActivitySample[] = [];
  for (let tsMs = at(from); tsMs <= at(to); tsMs += SAMPLE_INTERVAL_MS) {
    samples.push({ tsMs, appId, title: null, idleMs: 0, locked: false });
  }
  return samples;
}

function span(start: string, end: string, extra: Partial<Span> = {}): Span {
  return {
    id: null,
    appId: 'code',
    startMs: at(start),
    endMs: at(end),
    title: null,
    closed: false,
    ...extra,
  };
}

describe('mergeSamples', () => {
  it('merges a continuous run of one app into one open session', () => {
    const result = mergeSamples(null, run('09:00:00', '09:01:00'));

    expect(result.spans).toEqual([span('09:00:00', '09:01:00')]);
    expect(result.accepted).toBe(RUN_LENGTH);
  });

  it('closes the session at the moment of an app switch and opens the next', () => {
    const samples = [
      ...run('09:00:00', '09:00:20', 'code'),
      ...run('09:00:25', '09:00:40', 'firefox'),
    ];

    const { spans } = mergeSamples(null, samples);

    expect(spans).toEqual([
      span('09:00:00', '09:00:25', { closed: true }),
      span('09:00:25', '09:00:40', { appId: 'firefox' }),
    ]);
  });

  it('keeps the session open across a gap of exactly 15s', () => {
    const first = sample('09:00:00');
    const second = { ...first, tsMs: first.tsMs + MAX_GAP_MS };

    const { spans } = mergeSamples(null, [first, second]);

    expect(spans).toEqual([span('09:00:00', '09:00:15')]);
  });

  it('closes the session at its last sample after a gap of more than 15s', () => {
    const samples = [sample('09:00:00'), sample('09:00:10'), sample('09:00:26')];

    const { spans } = mergeSamples(null, samples);

    expect(spans).toEqual([
      span('09:00:00', '09:00:10', { closed: true }),
      span('09:00:26', '09:00:26'),
    ]);
  });

  it('does not stretch the previous app over a gap before a switch', () => {
    const { spans } = mergeSamples(null, [sample('09:00:00'), sample('09:01:00', 'firefox')]);

    expect(spans).toEqual([
      span('09:00:00', '09:00:00', { closed: true }),
      span('09:01:00', '09:01:00', { appId: 'firefox' }),
    ]);
  });

  it('ends the session when the user went idle, not at the idle sample', () => {
    const samples = [
      ...run('09:00:00', '09:02:25'),
      sample('09:02:30', 'code', { idleMs: IDLE_THRESHOLD_MS }),
      ...run('09:02:35', '09:02:45'),
    ];

    const { spans } = mergeSamples(null, samples);

    expect(spans).toEqual([
      span('09:00:00', '09:00:30', { closed: true }),
      span('09:02:35', '09:02:45'),
    ]);
  });

  it('treats idle just under the threshold as active', () => {
    const almostIdle = sample('09:00:05', 'code', { idleMs: IDLE_THRESHOLD_MS - 1 });

    const { spans } = mergeSamples(null, [sample('09:00:00'), almostIdle]);

    expect(spans).toEqual([span('09:00:00', '09:00:05')]);
  });

  it('closes the session on a locked sample', () => {
    const samples = [
      sample('09:00:00'),
      sample('09:00:05'),
      sample('09:00:10', 'code', { locked: true }),
    ];

    const { spans } = mergeSamples(null, samples);

    expect(spans).toEqual([span('09:00:00', '09:00:05', { closed: true })]);
  });

  it('never ends an idle session before it started', () => {
    const idle = sample('09:00:05', 'code', { idleMs: IDLE_THRESHOLD_MS });

    const { spans } = mergeSamples(null, [sample('09:00:00'), idle]);

    expect(spans).toEqual([span('09:00:00', '09:00:00', { closed: true })]);
  });

  it('closes after a gap even when the next sample is idle', () => {
    const idle = sample('09:05:00', 'code', { idleMs: IDLE_THRESHOLD_MS });

    const { spans } = mergeSamples(null, [sample('09:00:00'), sample('09:00:05'), idle]);

    expect(spans).toEqual([span('09:00:00', '09:00:05', { closed: true })]);
  });

  it('ignores away samples while no session is open', () => {
    const result = mergeSamples(null, [sample('09:00:00', 'code', { locked: true })]);

    expect(result).toEqual({ spans: [], accepted: 1, late: 0 });
  });

  it('gives the same sessions for samples in any order', () => {
    const ordered = [
      ...run('09:00:00', '09:00:20', 'code'),
      ...run('09:00:25', '09:00:40', 'firefox'),
    ];
    // Even positions forward, then odd ones backward: almost nothing stays in place.
    const shuffled = [
      ...ordered.filter((_, index) => index % 2 === 0),
      ...ordered.filter((_, index) => index % 2 === 1).reverse(),
    ];

    expect(mergeSamples(null, shuffled)).toEqual(mergeSamples(null, ordered));
  });

  it('keeps the first of two samples with the same timestamp', () => {
    const samples = [sample('09:00:00', 'code'), sample('09:00:00', 'firefox')];

    const { spans } = mergeSamples(null, samples);

    expect(spans).toEqual([span('09:00:00', '09:00:00')]);
  });

  it('extends the stored open session', () => {
    const stored = span('09:00:00', '09:00:10', { id: 'stored' });

    const { spans } = mergeSamples(stored, run('09:00:15', '09:00:25'));

    expect(spans).toEqual([span('09:00:00', '09:00:25', { id: 'stored' })]);
  });

  it('closes the stored open session when the batch starts after a gap', () => {
    const stored = span('09:00:00', '09:00:10', { id: 'stored' });

    const { spans } = mergeSamples(stored, [sample('09:01:00')]);

    expect(spans).toEqual([
      span('09:00:00', '09:00:10', { id: 'stored', closed: true }),
      span('09:01:00', '09:01:00'),
    ]);
  });

  it('skips samples the stored session already covers', () => {
    const stored = span('09:00:00', '09:00:10', { id: 'stored' });

    const result = mergeSamples(stored, [sample('09:00:05', 'firefox'), sample('09:00:10')]);

    expect(result).toEqual({ spans: [], accepted: 0, late: 2 });
  });

  it('keeps the latest title the session saw', () => {
    const samples = [
      sample('09:00:00', 'code', { title: 'a.ts' }),
      sample('09:00:05', 'code', { title: 'b.ts' }),
      sample('09:00:10', 'code', { title: null }),
    ];

    const { spans } = mergeSamples(null, samples);

    expect(spans).toEqual([span('09:00:00', '09:00:10', { title: 'b.ts' })]);
  });
});
