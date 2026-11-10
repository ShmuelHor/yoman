import type { BatteryNow } from '@yoman/shared/battery';

import { AVERAGE_WINDOW_MS, minutesRemaining } from '../domain/time-remaining.js';
import type { BatteryStore } from './store.js';

/** At most one reading a second over the window: far above the agent's 60 s cadence. */
const MS_PER_SECOND = 1_000;
const WINDOW_READING_LIMIT = AVERAGE_WINDOW_MS / MS_PER_SECOND;

/** The newest sample with the time remaining, or `null` when no battery ever reported. */
export function batteryNow(store: BatteryStore): Promise<BatteryNow | null> {
  return store.transaction(async (tx) => {
    const latest = await tx.latestSample();
    if (latest === null) {
      return null;
    }
    const readings = await tx.readingsBetween(
      latest.tsMs - AVERAGE_WINDOW_MS,
      latest.tsMs + 1,
      WINDOW_READING_LIMIT,
    );
    return {
      ts: new Date(latest.tsMs).toISOString(),
      capacityPct: latest.capacityPct,
      status: latest.status,
      powerW: latest.powerW,
      minutesRemaining: minutesRemaining(latest, readings),
      healthPct: latest.healthPct,
    };
  });
}
