import type { BatteryDay } from '@yoman/shared/battery';

import { isDraining, type PowerReading } from './reading.js';

/** Two decimal places, like the watts the agent reports. */
const WATT_PRECISION = 100;

/** A stored sample, as far as the day's summary needs it. */
export interface DaySample extends PowerReading {
  readonly healthPct: number;
  readonly cycleCount: number;
}

/**
 * One `battery_daily` row: health as of the day's last sample, the most cycles
 * seen, and the average draw while discharging (0 on a day spent on the
 * charger). `null` for a day with no samples.
 */
export function summarizeDay(date: string, samples: readonly DaySample[]): BatteryDay | null {
  const latest = samples.reduce<DaySample | null>(
    (newest, sample) => (newest === null || sample.tsMs > newest.tsMs ? sample : newest),
    null,
  );
  if (latest === null) {
    return null;
  }
  const draws = samples.filter(isDraining).map((sample) => sample.powerW);
  const averageW = draws.length === 0 ? 0 : draws.reduce((sum, w) => sum + w, 0) / draws.length;
  return {
    date,
    healthPct: latest.healthPct,
    cycles: samples.reduce((most, sample) => Math.max(most, sample.cycleCount), 0),
    averageW: Math.round(averageW * WATT_PRECISION) / WATT_PRECISION,
  };
}
