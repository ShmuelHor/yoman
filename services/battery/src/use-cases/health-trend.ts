import type { BatteryDay } from '@yoman/shared/battery';
import { LIMITS } from '@yoman/shared/limits';

import { windowStart } from '../domain/sample-date.js';
import type { BatteryStore } from './store.js';

/** The daily rows of the last `days` days up to today, oldest first. Days without samples have none. */
export function healthTrend(store: BatteryStore, days: number, now: Date): Promise<BatteryDay[]> {
  return store.transaction((tx) => tx.daysSince(windowStart(now, days), LIMITS.trendDays));
}
