import type { BatteryStatus } from '@yoman/shared/ingest';
import { LIMITS } from '@yoman/shared/limits';

import { isDraining, type PowerReading } from './reading.js';

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const AVERAGE_WINDOW_MINUTES = 30;

/** Time remaining averages the draw over this window (SPEC §5 battery). */
export const AVERAGE_WINDOW_MS = AVERAGE_WINDOW_MINUTES * MS_PER_MINUTE;

/** The contract's upper bound: a week. */
const MAX_MINUTES = LIMITS.minutesPerDay * LIMITS.daysPerWeek;

/** The newest sample: what is left and whether it is draining. */
export interface ChargeState {
  readonly tsMs: number;
  readonly status: BatteryStatus;
  readonly capacityPct: number;
  readonly energyFullWh: number;
}

/**
 * Minutes until empty at the average draw of the 30 minutes up to `latest`,
 * or `null` when the battery is not discharging or no draw was measured.
 */
export function minutesRemaining(
  latest: ChargeState,
  readings: readonly PowerReading[],
): number | null {
  if (latest.status !== 'discharging') {
    return null;
  }
  const windowStartMs = latest.tsMs - AVERAGE_WINDOW_MS;
  const draws = readings
    .filter((r) => isDraining(r) && r.powerW > 0)
    .filter((r) => r.tsMs > windowStartMs && r.tsMs <= latest.tsMs)
    .map((r) => r.powerW);
  if (draws.length === 0) {
    return null;
  }
  const averageW = draws.reduce((sum, w) => sum + w, 0) / draws.length;
  const remainingWh = (latest.energyFullWh * latest.capacityPct) / LIMITS.percent;
  const minutes = Math.floor((remainingWh / averageW) * MINUTES_PER_HOUR);
  return Math.min(minutes, MAX_MINUTES);
}
