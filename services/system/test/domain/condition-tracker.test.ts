import { describe, expect, it } from 'vitest';

import {
  type ConditionPoint,
  type ConditionRule,
  IDLE_TRACK,
  MAX_SAMPLE_GAP_MS,
  trackCondition,
} from '../../src/domain/condition-tracker.js';
import type { IncidentState } from '../../src/domain/incident.js';

const SAMPLE_INTERVAL_MS = 5_000;
const SUSTAIN_MS = 15_000;
const HIGH = 55;
const PEAK = 80;
const LOW = 10;

const sustained: ConditionRule = { type: 'cpu', sustainMs: SUSTAIN_MS };
const immediate: ConditionRule = { type: 'thermal', sustainMs: null };

/** A wall-clock time on the fixture day, `HH:MM:SS` in UTC. */
function at(clock: string): number {
  return Date.parse(`2026-11-08T${clock}.000Z`);
}

/** One point every 5 s, from `from` up to and including `to`. */
function run(from: string, to: string, value: number, active = true): ConditionPoint[] {
  const points: ConditionPoint[] = [];
  for (let tsMs = at(from); tsMs <= at(to); tsMs += SAMPLE_INTERVAL_MS) {
    points.push({ tsMs, active, value });
  }
  return points;
}

function point(clock: string, value: number, active: boolean): ConditionPoint {
  return { tsMs: at(clock), active, value };
}

function stored(start: string, peak: number): IncidentState {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'cpu',
    startMs: at(start),
    endMs: null,
    peak,
    culprits: [],
    pid: null,
  };
}

describe('trackCondition', () => {
  it('opens no incident for a short spike', () => {
    const points = [...run('09:00:00', '09:00:15', HIGH), point('09:00:20', LOW, false)];

    const result = trackCondition(sustained, IDLE_TRACK, null, points);

    expect(result.changes).toEqual([]);
    expect(result.track).toEqual({ runStartMs: null, runPeak: 0, lastMs: at('09:00:20') });
  });

  it('opens exactly one incident for sustained load, from when the load began', () => {
    const points = run('09:00:00', '09:05:00', HIGH);

    const result = trackCondition(sustained, IDLE_TRACK, null, points);

    expect(result.changes).toEqual([
      {
        incident: {
          id: null,
          type: 'cpu',
          startMs: at('09:00:00'),
          endMs: null,
          peak: HIGH,
          culprits: [],
          pid: null,
        },
        openedAtMs: at('09:00:20'),
      },
    ]);
  });

  it('opens only after the condition held for more than the sustain time', () => {
    const exactly = trackCondition(sustained, IDLE_TRACK, null, run('09:00:00', '09:00:15', HIGH));
    const longer = trackCondition(sustained, IDLE_TRACK, null, run('09:00:00', '09:00:20', HIGH));

    expect(exactly.changes).toEqual([]);
    expect(longer.changes).toHaveLength(1);
  });

  it('opens on the first point for a rule without a sustain time', () => {
    const result = trackCondition(immediate, IDLE_TRACK, null, [point('09:00:00', HIGH, true)]);

    expect(result.changes.map((change) => change.openedAtMs)).toEqual([at('09:00:00')]);
  });

  it('carries a run across batches, so sustained load split over two opens one incident', () => {
    const first = trackCondition(sustained, IDLE_TRACK, null, run('09:00:00', '09:00:10', HIGH));
    const second = trackCondition(sustained, first.track, null, run('09:00:15', '09:01:00', HIGH));

    expect(first.changes).toEqual([]);
    expect(second.changes.map((change) => change.incident.startMs)).toEqual([at('09:00:00')]);
  });

  it('extends a stored open incident and keeps the highest peak', () => {
    const track = { runStartMs: at('09:00:00'), runPeak: PEAK, lastMs: at('09:01:00') };
    const open = stored('09:00:00', PEAK);

    const result = trackCondition(sustained, track, open, run('09:01:05', '09:02:00', HIGH));

    expect(result.changes).toEqual([{ incident: open, openedAtMs: null }]);
  });

  it('raises the peak when the load gets worse', () => {
    const points = [...run('09:00:00', '09:00:30', HIGH), point('09:00:35', PEAK, true)];

    const result = trackCondition(sustained, IDLE_TRACK, null, points);

    expect(result.changes.map((change) => change.incident.peak)).toEqual([PEAK]);
    expect(result.track.runPeak).toBe(PEAK);
  });

  it('closes the incident at the first point the condition no longer holds', () => {
    const track = { runStartMs: at('09:00:00'), runPeak: HIGH, lastMs: at('09:01:00') };

    const result = trackCondition(sustained, track, stored('09:00:00', HIGH), [
      point('09:01:05', LOW, false),
    ]);

    expect(result.changes.map((change) => change.incident.endMs)).toEqual([at('09:01:05')]);
    expect(result.track.runStartMs).toBeNull();
  });

  it('closes the incident at the last point before a gap, and starts a new run after it', () => {
    const track = { runStartMs: at('09:00:00'), runPeak: HIGH, lastMs: at('09:01:00') };
    const afterGap = at('09:01:00') + MAX_SAMPLE_GAP_MS + SAMPLE_INTERVAL_MS;

    const result = trackCondition(sustained, track, stored('09:00:00', HIGH), [
      { tsMs: afterGap, active: true, value: HIGH },
    ]);

    expect(result.changes.map((change) => change.incident.endMs)).toEqual([at('09:01:00')]);
    expect(result.track).toEqual({ runStartMs: afterGap, runPeak: HIGH, lastMs: afterGap });
  });

  it('opens a second incident when the load returns after ending', () => {
    const points = [
      ...run('09:00:00', '09:00:30', HIGH),
      point('09:00:35', LOW, false),
      ...run('09:00:40', '09:01:10', HIGH),
    ];

    const result = trackCondition(sustained, IDLE_TRACK, null, points);

    expect(
      result.changes.map(({ incident }) => [incident.startMs, incident.endMs, incident.id]),
    ).toEqual([
      [at('09:00:00'), at('09:00:35'), null],
      [at('09:00:40'), null, null],
    ]);
  });

  it('leaves an open incident unchanged by a batch without points', () => {
    const track = { runStartMs: at('09:00:00'), runPeak: HIGH, lastMs: at('09:01:00') };

    const result = trackCondition(sustained, track, stored('09:00:00', HIGH), []);

    expect(result).toEqual({ track, changes: [] });
  });
});
