/** A gap between samples longer than this closes the session (SPEC §5 sessions). */
export const MAX_GAP_MS = 15_000;

/** Idle for at least this long means the user is away from the computer (SPEC §4.1). */
export const IDLE_THRESHOLD_MS = 120_000;

/** One focused-window sample, with its timestamp already parsed. */
export interface ActivitySample {
  readonly tsMs: number;
  readonly appId: string;
  readonly title: string | null;
  readonly idleMs: number;
  readonly locked: boolean;
}

/**
 * A run of consecutive samples of one app. `id` is `null` until it is stored;
 * a span with an `id` is the stored open session, extended or closed.
 */
export interface Span {
  readonly id: string | null;
  readonly appId: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly title: string | null;
  readonly closed: boolean;
}

export interface MergeResult {
  /** Every span this batch created or changed, oldest first. At most the last one is open. */
  readonly spans: readonly Span[];
  /** Samples that were applied. */
  readonly accepted: number;
  /** Samples at or before the end of the stored open session, which is already recorded. */
  readonly late: number;
}

function isAway(sample: ActivitySample): boolean {
  return sample.locked || sample.idleMs >= IDLE_THRESHOLD_MS;
}

function isContinuous(span: Span, sample: ActivitySample): boolean {
  return sample.tsMs - span.endMs <= MAX_GAP_MS;
}

/** Stable, so of two samples with the same timestamp the first one sent wins. */
function chronological(samples: readonly ActivitySample[]): ActivitySample[] {
  const sorted = [...samples].sort((a, b) => a.tsMs - b.tsMs);
  return sorted.filter((sample, index) => index === 0 || sample.tsMs !== sorted[index - 1]?.tsMs);
}

/**
 * The user went away `idleMs` before this sample, so time after that is not
 * the app's. A gap already ended the span at its last sample.
 */
function closeOnAway(span: Span, sample: ActivitySample): Span {
  if (!isContinuous(span, sample)) {
    return { ...span, closed: true };
  }
  const awaySince = Math.min(span.endMs, sample.tsMs - sample.idleMs);
  return { ...span, endMs: Math.max(span.startMs, awaySince), closed: true };
}

/** On a switch the previous app is in focus until the new one appears, unless there was a gap. */
function closeOnSwitch(span: Span, sample: ActivitySample): Span {
  return isContinuous(span, sample)
    ? { ...span, endMs: sample.tsMs, closed: true }
    : { ...span, closed: true };
}

function extend(span: Span, sample: ActivitySample): Span {
  return { ...span, endMs: sample.tsMs, title: sample.title ?? span.title };
}

function open(sample: ActivitySample): Span {
  return {
    id: null,
    appId: sample.appId,
    startMs: sample.tsMs,
    endMs: sample.tsMs,
    title: sample.title,
    closed: false,
  };
}

interface Step {
  readonly closed: Span | null;
  readonly current: Span | null;
}

/** Folds one sample into the current span. */
function step(current: Span | null, sample: ActivitySample): Step {
  if (current === null) {
    return { closed: null, current: isAway(sample) ? null : open(sample) };
  }
  if (isAway(sample)) {
    return { closed: closeOnAway(current, sample), current: null };
  }
  if (current.appId === sample.appId && isContinuous(current, sample)) {
    return { closed: null, current: extend(current, sample) };
  }
  return { closed: closeOnSwitch(current, sample), current: open(sample) };
}

/**
 * Merges a batch of window samples into sessions, continuing from the stored
 * open session. Consecutive samples of one app form a session; a gap of more
 * than {@link MAX_GAP_MS}, an idle or locked sample, or a switch to another
 * app closes it. Samples may arrive in any order.
 */
export function mergeSamples(stored: Span | null, samples: readonly ActivitySample[]): MergeResult {
  const spans: Span[] = [];
  let current = stored;
  let accepted = 0;
  let late = 0;

  for (const sample of chronological(samples)) {
    if (stored !== null && sample.tsMs <= stored.endMs) {
      late += 1;
      continue;
    }
    accepted += 1;
    const next = step(current, sample);
    if (next.closed !== null) {
      spans.push(next.closed);
    }
    current = next.current;
  }

  // Spans are never mutated, so an unchanged stored session is still the same object.
  if (current !== null && current !== stored) {
    spans.push(current);
  }
  return { spans, accepted, late };
}
