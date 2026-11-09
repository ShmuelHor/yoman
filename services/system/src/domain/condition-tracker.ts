import type { IncidentType } from '@yoman/shared/system';

import type { IncidentChange, IncidentState } from './incident.js';

/**
 * Samples come every 5 s while the computer is in use. A longer gap means the
 * screen was locked or the agent stopped, so the condition is no longer
 * known to hold: an open incident ends at the last sample before the gap.
 */
export const MAX_SAMPLE_GAP_MS = 15_000;

/** One reading of a condition: whether it holds, and how severe it is. */
export interface ConditionPoint {
  readonly tsMs: number;
  readonly active: boolean;
  readonly value: number;
}

/** What the tracker remembers between batches. */
export interface ConditionTrack {
  /** When the current unbroken run of active points began, or `null`. */
  readonly runStartMs: number | null;
  /** The worst value of the current run. */
  readonly runPeak: number;
  /** The newest point applied. */
  readonly lastMs: number | null;
}

export const IDLE_TRACK: ConditionTrack = { runStartMs: null, runPeak: 0, lastMs: null };

export interface ConditionRule {
  readonly type: IncidentType;
  /**
   * How long the condition must hold, strictly more than this, before an
   * incident opens. `null` opens it on the first active point.
   */
  readonly sustainMs: number | null;
}

export interface TrackResult {
  readonly track: ConditionTrack;
  /** Every incident the points opened, changed or closed, oldest first. At most the last is open. */
  readonly changes: readonly IncidentChange[];
}

function isSustained(rule: ConditionRule, heldMs: number): boolean {
  return rule.sustainMs === null || heldMs > rule.sustainMs;
}

/**
 * Applies chronological points to a condition. A short spike opens nothing;
 * a condition that holds long enough opens exactly one incident, which starts
 * when the run began and stays open, across batches, until the condition
 * stops holding or the samples stop.
 */
export function trackCondition(
  rule: ConditionRule,
  track: ConditionTrack,
  open: IncidentState | null,
  points: readonly ConditionPoint[],
): TrackResult {
  let { runStartMs, runPeak, lastMs } = track;
  let current: IncidentChange | null = open === null ? null : { incident: open, openedAtMs: null };
  let touched = false;
  const changes: IncidentChange[] = [];

  const close = (endMs: number): void => {
    if (current !== null) {
      changes.push({ ...current, incident: { ...current.incident, endMs } });
      current = null;
    }
    runStartMs = null;
    runPeak = 0;
  };

  for (const point of points) {
    if (lastMs !== null && point.tsMs - lastMs > MAX_SAMPLE_GAP_MS) {
      close(lastMs);
    }
    lastMs = point.tsMs;
    if (!point.active) {
      close(point.tsMs);
      continue;
    }
    if (runStartMs === null) {
      runStartMs = point.tsMs;
      runPeak = point.value;
    } else {
      runPeak = Math.max(runPeak, point.value);
    }
    if (current !== null) {
      const peak = Math.max(current.incident.peak, runPeak);
      current = { ...current, incident: { ...current.incident, peak } };
      touched = true;
    } else if (isSustained(rule, point.tsMs - runStartMs)) {
      current = {
        incident: {
          id: null,
          type: rule.type,
          startMs: runStartMs,
          endMs: null,
          peak: runPeak,
          culprits: [],
          pid: null,
        },
        openedAtMs: point.tsMs,
      };
      touched = true;
    }
  }

  if (current !== null && touched) {
    changes.push(current);
  }
  return { track: { runStartMs, runPeak, lastMs }, changes };
}
