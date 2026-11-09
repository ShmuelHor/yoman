import type { BatteryStatus } from '@yoman/shared/ingest';
import { describe, expect, it } from 'vitest';

import { type DaySample, summarizeDay } from '../../src/domain/daily.js';

const DAY = '2026-11-08';
const EARLIER_HEALTH = 90.1;
const LATER_HEALTH = 89.9;
const CYCLES = 300;
const LIGHT_W = 8;
const HEAVY_W = 11.35;
/** (8 + 11.35) / 2, to two decimals. */
const AVERAGE_W = 9.68;
const CHARGE_W = 45;

/** A wall-clock time on the fixture day, `HH:MM` in UTC. */
function sample(clock: string, overrides: Partial<DaySample> = {}): DaySample {
  return {
    tsMs: Date.parse(`${DAY}T${clock}:00.000Z`),
    powerW: LIGHT_W,
    status: 'discharging' satisfies BatteryStatus,
    healthPct: EARLIER_HEALTH,
    cycleCount: CYCLES,
    ...overrides,
  };
}

describe('summarizeDay', () => {
  it('takes health from the last sample of the day, whatever the order', () => {
    const samples = [
      sample('18:00', { healthPct: LATER_HEALTH }),
      sample('08:00', { healthPct: EARLIER_HEALTH }),
    ];

    expect(summarizeDay(DAY, samples)?.healthPct).toBe(LATER_HEALTH);
  });

  it('takes the most cycles seen', () => {
    const samples = [sample('08:00', { cycleCount: CYCLES + 1 }), sample('09:00')];

    expect(summarizeDay(DAY, samples)?.cycles).toBe(CYCLES + 1);
  });

  it('averages the draw over discharging samples only', () => {
    const samples = [
      sample('08:00', { powerW: LIGHT_W }),
      sample('08:01', { powerW: HEAVY_W }),
      sample('08:02', { powerW: CHARGE_W, status: 'charging' }),
    ];

    expect(summarizeDay(DAY, samples)).toEqual({
      date: DAY,
      healthPct: EARLIER_HEALTH,
      cycles: CYCLES,
      averageW: AVERAGE_W,
    });
  });

  it('reports no draw for a day spent on the charger', () => {
    expect(summarizeDay(DAY, [sample('08:00', { status: 'full', powerW: 0 })])?.averageW).toBe(0);
  });

  it('is null for a day without samples', () => {
    expect(summarizeDay(DAY, [])).toBeNull();
  });
});
