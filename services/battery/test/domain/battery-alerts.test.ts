import type { BatteryStatus } from '@yoman/shared/ingest';
import { describe, expect, it } from 'vitest';

import {
  type AlertReading,
  type AlertState,
  advanceAlerts,
  INITIAL_ALERT_STATE,
} from '../../src/domain/battery-alerts.js';

const PLENTY = 50;
const AT_LOW_THRESHOLD = 15;
const LOW = 14;
const LOWER = 12;
const CRITICAL = 7;
const FULL = 100;
const NEARLY_FULL = 99;

/** A wall-clock time on the fixture days, `DD HH:MM` in UTC. */
function at(
  clock: string,
  capacityPct: number,
  status: BatteryStatus = 'discharging',
): AlertReading {
  const [day, time] = clock.split(' ');
  const ts = `2026-11-${day}T${time}:00.000Z`;
  return { ts, tsMs: Date.parse(ts), capacityPct, status };
}

/** Feeds batches in turn, as the gateway would, and collects every alert type raised. */
function run(...batches: AlertReading[][]): { types: string[]; state: AlertState } {
  let state = INITIAL_ALERT_STATE;
  const types: string[] = [];
  for (const batch of batches) {
    const outcome = advanceAlerts(state, batch);
    state = outcome.state;
    types.push(...outcome.alerts.map((alert) => alert.type));
  }
  return { types, state };
}

describe('advanceAlerts: low and critical', () => {
  it('raises an important battery-low alert below 15% while discharging', () => {
    const { alerts } = advanceAlerts(INITIAL_ALERT_STATE, [
      at('08 09:00', AT_LOW_THRESHOLD),
      at('08 09:01', LOW),
    ]);

    expect(alerts).toEqual([
      {
        alertKey: 'battery-low',
        type: 'battery-low',
        level: 'important',
        ts: '2026-11-08T09:01:00.000Z',
        params: { percent: LOW },
      },
    ]);
  });

  it('does not alert at exactly 15%', () => {
    expect(run([at('08 09:00', AT_LOW_THRESHOLD)]).types).toEqual([]);
  });

  it('raises a critical battery-critical alert below 8%', () => {
    const { alerts } = advanceAlerts(INITIAL_ALERT_STATE, [at('08 09:00', CRITICAL)]);

    expect(alerts).toMatchObject([
      { type: 'battery-critical', level: 'critical', params: { percent: CRITICAL } },
    ]);
  });

  it('alerts once per level, not on every sample below it', () => {
    const batches = [[at('08 09:00', LOW)], [at('08 09:01', LOWER), at('08 09:02', LOWER)]];

    expect(run(...batches).types).toEqual(['battery-low']);
  });

  it('escalates from low to critical across batches', () => {
    const batches = [[at('08 09:00', LOW)], [at('08 09:01', CRITICAL)], [at('08 09:02', CRITICAL)]];

    expect(run(...batches).types).toEqual(['battery-low', 'battery-critical']);
  });

  it('keeps only critical when one batch falls through both thresholds', () => {
    expect(run([at('08 09:00', LOW), at('08 09:01', CRITICAL)]).types).toEqual([
      'battery-critical',
    ]);
  });

  it('never alerts on the charger, however low', () => {
    const batch = [at('08 09:00', CRITICAL, 'charging'), at('08 09:01', CRITICAL, 'not-charging')];

    expect(run(batch).types).toEqual([]);
  });

  it('alerts again after charging and draining once more', () => {
    const batches = [
      [at('08 09:00', LOW)],
      [at('08 09:01', LOW, 'charging')],
      [at('08 09:02', LOW)],
    ];

    expect(run(...batches).types).toEqual(['battery-low', 'battery-low']);
  });
});

describe('advanceAlerts: plugged in at 100%', () => {
  it('raises a normal alert once plugged in at 100% for more than 4 hours', () => {
    const { alerts } = advanceAlerts(INITIAL_ALERT_STATE, [
      at('08 09:00', FULL, 'full'),
      at('08 13:00', FULL, 'full'),
      at('08 13:01', FULL, 'full'),
    ]);

    expect(alerts).toEqual([
      {
        alertKey: 'battery-plugged-full',
        type: 'battery-plugged-full',
        level: 'normal',
        ts: '2026-11-08T13:01:00.000Z',
        params: { hours: 4 },
      },
    ]);
  });

  it('does not alert at exactly 4 hours', () => {
    expect(run([at('08 09:00', FULL, 'full')], [at('08 13:00', FULL, 'full')]).types).toEqual([]);
  });

  it('counts a battery held at 100% as not-charging or unknown', () => {
    const batches = [[at('08 09:00', FULL, 'not-charging')], [at('08 13:01', FULL, 'unknown')]];

    expect(run(...batches).types).toEqual(['battery-plugged-full']);
  });

  it('alerts once per stretch on the charger, with the hours so far', () => {
    const { alerts } = advanceAlerts(INITIAL_ALERT_STATE, [
      at('08 21:00', FULL, 'full'),
      at('09 07:30', FULL, 'full'),
      at('09 08:00', FULL, 'full'),
    ]);

    expect(alerts).toMatchObject([{ ts: '2026-11-09T07:30:00.000Z', params: { hours: 10 } }]);
  });

  it('keeps counting through a gap with no samples, as while the screen is locked', () => {
    expect(run([at('08 09:00', FULL, 'full')], [at('08 18:00', FULL, 'full')]).types).toEqual([
      'battery-plugged-full',
    ]);
  });

  it('restarts the clock when unplugged or below 100%', () => {
    const batches = [
      [at('08 09:00', FULL, 'full')],
      [at('08 10:00', NEARLY_FULL)],
      [at('08 10:01', FULL, 'charging')],
      [at('08 13:01', FULL, 'full')],
    ];

    expect(run(...batches).types).toEqual([]);
  });

  it('alerts again for the next stretch after unplugging', () => {
    const batches = [
      [at('08 09:00', FULL, 'full'), at('08 13:01', FULL, 'full')],
      [at('08 13:05', NEARLY_FULL)],
      [at('08 13:10', FULL, 'full'), at('08 17:11', FULL, 'full')],
    ];

    expect(run(...batches).types).toEqual(['battery-plugged-full', 'battery-plugged-full']);
  });
});

describe('advanceAlerts: ordering and retries', () => {
  it('applies a batch in timestamp order, whatever order it arrives in', () => {
    const { types, state } = run([
      at('08 09:02', LOW),
      at('08 09:00', PLENTY),
      at('08 09:01', PLENTY),
    ]);

    expect(types).toEqual(['battery-low']);
    expect(state.lastTsMs).toBe(Date.parse('2026-11-08T09:02:00.000Z'));
  });

  it('raises nothing for a retried batch', () => {
    const batch = [at('08 09:00', PLENTY), at('08 09:01', CRITICAL)];

    expect(run(batch, batch).types).toEqual(['battery-critical']);
  });

  it('skips samples at or before the newest one applied', () => {
    const batches = [
      [at('08 09:05', PLENTY)],
      [at('08 09:03', CRITICAL), at('08 09:05', CRITICAL)],
    ];

    expect(run(...batches).types).toEqual([]);
  });

  it('applies the first of two samples with one timestamp', () => {
    const { state } = run([at('08 09:00', LOW), at('08 09:00', PLENTY)]);

    expect(state.drain).toBe('low');
  });

  it('leaves the state alone for an empty batch', () => {
    expect(advanceAlerts(INITIAL_ALERT_STATE, []).state).toBe(INITIAL_ALERT_STATE);
  });
});
