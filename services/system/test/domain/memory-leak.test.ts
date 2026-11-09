import type { Culprit } from '@yoman/shared/system';
import { describe, expect, it } from 'vitest';

import type { IncidentState } from '../../src/domain/incident.js';
import {
  LEAK_BYTES_PER_HOUR,
  LEAK_DROP_TOLERANCE,
  LEAK_MIN_SPAN_MS,
  LEAK_WINDOW_MS,
  leakRate,
  type RssPoint,
  trackLeaks,
} from '../../src/domain/memory-leak.js';

/** Five minutes, the slowest the agent samples processes. */
const SNAPSHOT_INTERVAL_MS = 300_000;
const GIB = 1_073_741_824;
const AT = Date.parse('2026-11-08T10:00:00.000Z');
const PID = 7;
const FAST = 2 * GIB;
const FASTER = 3_221_225_472;
/** A snapshot in the middle of an hour of snapshots. */
const MIDDLE = LEAK_WINDOW_MS / SNAPSHOT_INTERVAL_MS / 2;

/** One snapshot every 5 min over the `spanMs` before `AT`, growing by `perHour` bytes an hour. */
function growing(perHour: number, spanMs = LEAK_WINDOW_MS): RssPoint[] {
  const points: RssPoint[] = [];
  for (let ageMs = spanMs; ageMs >= 0; ageMs -= SNAPSHOT_INTERVAL_MS) {
    points.push({
      tsMs: AT - ageMs,
      rssBytes: Math.round(GIB + (perHour * (spanMs - ageMs)) / LEAK_WINDOW_MS),
    });
  }
  return points;
}

/** Scales the RSS of the middle snapshot. */
function withMiddle(points: readonly RssPoint[], factor: number): RssPoint[] {
  return points.map((point, index) =>
    index === MIDDLE ? { ...point, rssBytes: point.rssBytes * factor } : point,
  );
}

function culprit(comm = 'node'): Culprit {
  return { pid: PID, comm, container: null, cpuPct: 1, rssBytes: FASTER };
}

function openLeak(comm = 'node'): IncidentState {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'memory-leak',
    startMs: AT - LEAK_WINDOW_MS,
    endMs: null,
    peak: FAST,
    culprits: [culprit(comm)],
    pid: PID,
  };
}

describe('leakRate', () => {
  it('reports steady growth over 1 GiB an hour', () => {
    expect(leakRate(growing(FAST), AT)).toBe(FAST);
  });

  it('ignores growth of at most 1 GiB an hour', () => {
    expect(leakRate(growing(LEAK_BYTES_PER_HOUR), AT)).toBeNull();
  });

  it('ignores a history shorter than half an hour', () => {
    const short = growing(FASTER, LEAK_MIN_SPAN_MS - SNAPSHOT_INTERVAL_MS);

    expect(leakRate(short, AT)).toBeNull();
  });

  it('ignores growth that is not steady', () => {
    expect(leakRate(withMiddle(growing(FAST), 1 / 2), AT)).toBeNull();
  });

  it('tolerates small drops and ignores snapshots outside the last hour', () => {
    const noisy = withMiddle(growing(FAST), 1 - LEAK_DROP_TOLERANCE / 2);
    const older = { tsMs: AT - 2 * LEAK_WINDOW_MS, rssBytes: 0 };

    expect(leakRate([older, ...noisy], AT)).toBe(FAST);
  });
});

describe('trackLeaks', () => {
  it('opens one incident for a leaking process listed twice, from the start of its history', () => {
    const history = growing(FAST);
    const candidate = { culprit: culprit(), history };

    const changes = trackLeaks([], [candidate, candidate], AT);

    expect(changes).toEqual([
      {
        incident: {
          id: null,
          type: 'memory-leak',
          startMs: AT - LEAK_WINDOW_MS,
          endMs: null,
          peak: FAST,
          culprits: [culprit()],
          pid: PID,
        },
        openedAtMs: AT,
      },
    ]);
  });

  it('extends an open leak while the process keeps leaking, keeping the highest rate', () => {
    const open = openLeak();

    const changes = trackLeaks([open], [{ culprit: culprit(), history: growing(FASTER) }], AT);

    expect(changes).toEqual([{ incident: { ...open, peak: FASTER }, openedAtMs: null }]);
  });

  it('closes a leak once the process stops growing', () => {
    const changes = trackLeaks([openLeak()], [{ culprit: culprit(), history: growing(0) }], AT);

    expect(changes.map((change) => change.incident.endMs)).toEqual([AT]);
  });

  it('closes a leak once the process leaves the top processes', () => {
    const changes = trackLeaks([openLeak()], [], AT);

    expect(changes.map((change) => change.incident.endMs)).toEqual([AT]);
  });

  it('tells a reused pid apart by its name', () => {
    const reused = { culprit: culprit('java'), history: growing(FAST) };

    const changes = trackLeaks([openLeak('node')], [reused], AT);

    expect(changes.map(({ incident }) => [incident.culprits[0]?.comm, incident.endMs])).toEqual([
      ['java', null],
      ['node', AT],
    ]);
  });
});
