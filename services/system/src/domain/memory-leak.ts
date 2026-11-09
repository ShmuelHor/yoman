import type { Culprit } from '@yoman/shared/system';

import type { IncidentChange, IncidentState } from './incident.js';

const MS_PER_HOUR = 3_600_000;
const BYTES_PER_GIB = 1_073_741_824;

/** RSS growing faster than this, steadily, is a leak (SPEC §5 system). */
export const LEAK_BYTES_PER_HOUR = BYTES_PER_GIB;

/** The growth is measured over the last hour of snapshots. */
export const LEAK_WINDOW_MS = MS_PER_HOUR;

/**
 * Processes are sampled at least every 5 min, so half an hour holds about six
 * snapshots: enough to tell steady growth from one large allocation.
 */
export const LEAK_MIN_SPAN_MS = MS_PER_HOUR / 2;
export const LEAK_MIN_SNAPSHOTS = 4;

/** A drop of up to this share between snapshots is allocator noise, not the growth stopping. */
export const LEAK_DROP_TOLERANCE = 0.05;

/** One process's memory at one moment. */
export interface RssPoint {
  readonly tsMs: number;
  readonly rssBytes: number;
}

/** A process in the newest process sample, with its recent history. */
export interface LeakCandidate {
  readonly culprit: Culprit;
  /** Its snapshots, the newest included; any order. */
  readonly history: readonly RssPoint[];
}

function grewSteadily(points: readonly RssPoint[]): boolean {
  return points.every((point, index) => {
    const previous = points[index - 1];
    return (
      previous === undefined || point.rssBytes >= previous.rssBytes * (1 - LEAK_DROP_TOLERANCE)
    );
  });
}

/**
 * The growth in bytes per hour over the hour before `atMs`, when the process
 * is leaking; otherwise `null`. Too short a history is never a leak.
 */
export function leakRate(history: readonly RssPoint[], atMs: number): number | null {
  const points = history
    .filter((point) => point.tsMs <= atMs && atMs - point.tsMs <= LEAK_WINDOW_MS)
    .sort((a, b) => a.tsMs - b.tsMs);
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined || points.length < LEAK_MIN_SNAPSHOTS) {
    return null;
  }
  const spanMs = last.tsMs - first.tsMs;
  if (spanMs < LEAK_MIN_SPAN_MS || !grewSteadily(points)) {
    return null;
  }
  const rate = Math.round(((last.rssBytes - first.rssBytes) / spanMs) * MS_PER_HOUR);
  return rate > LEAK_BYTES_PER_HOUR ? rate : null;
}

function windowStart(history: readonly RssPoint[], atMs: number): number {
  const inWindow = history.filter(
    (point) => point.tsMs <= atMs && atMs - point.tsMs <= LEAK_WINDOW_MS,
  );
  return Math.min(...inWindow.map((point) => point.tsMs));
}

function isSameProcess(incident: IncidentState, culprit: Culprit): boolean {
  return incident.pid === culprit.pid && incident.culprits[0]?.comm === culprit.comm;
}

/**
 * Applies one process sample to the open leak incidents. A process that
 * starts leaking opens one incident, which follows it while it keeps leaking
 * and ends at `atMs` once it stops or leaves the top processes.
 */
export function trackLeaks(
  open: readonly IncidentState[],
  candidates: readonly LeakCandidate[],
  atMs: number,
): IncidentChange[] {
  const changes: IncidentChange[] = [];
  const handled = new Set<IncidentState>();
  const seen = new Set<string>();

  for (const { culprit, history } of candidates) {
    // A sample lists the top processes by CPU, by RSS and by IO, so one may appear three times.
    const key = `${culprit.pid}:${culprit.comm}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const rate = leakRate(history, atMs);
    const existing = open.find((incident) => isSameProcess(incident, culprit));
    if (existing !== undefined) {
      handled.add(existing);
      const incident =
        rate === null
          ? { ...existing, endMs: atMs }
          : { ...existing, peak: Math.max(existing.peak, rate), culprits: [culprit] };
      changes.push({ incident, openedAtMs: null });
    } else if (rate !== null) {
      changes.push({
        incident: {
          id: null,
          type: 'memory-leak',
          startMs: windowStart(history, atMs),
          endMs: null,
          peak: rate,
          culprits: [culprit],
          pid: culprit.pid,
        },
        openedAtMs: atMs,
      });
    }
  }

  for (const incident of open) {
    if (!handled.has(incident)) {
      changes.push({ incident: { ...incident, endMs: atMs }, openedAtMs: null });
    }
  }
  return changes;
}
