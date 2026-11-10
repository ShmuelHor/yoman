import type { BatteryDay } from '@yoman/shared/battery';
import { LIMITS } from '@yoman/shared/limits';

import { addDays } from '../domain/local-time.js';
import type { BatteryStore } from './store.js';

/**
 * The daily rows of the `days` local days ending on `today`, oldest first.
 * Days without samples have none. The caller names today, so this never reads a clock.
 */
export function healthTrend(
  store: BatteryStore,
  days: number,
  today: string,
): Promise<BatteryDay[]> {
  return store.transaction((tx) => tx.daysSince(addDays(today, 1 - days), LIMITS.trendDays));
}
