import { LIMITS } from '@yoman/shared/limits';
import type { SystemTimeline } from '@yoman/shared/system';

import { localDaySpan } from '../domain/local-time.js';
import type { SystemStore } from './store.js';

/**
 * One local day: its pressure samples and the incidents that overlap it. A
 * day with a DST change can hold more samples than the contract allows; the
 * earliest ones are kept.
 */
export function systemTimeline(
  store: SystemStore,
  date: string,
  timeZone: string,
): Promise<SystemTimeline> {
  const { startMs, endMs } = localDaySpan(date, timeZone);
  return store.transaction(async (tx) => ({
    date,
    points: await tx.pressurePoints(startMs, endMs, LIMITS.timelinePoints),
    incidents: await tx.listIncidents(
      { from: new Date(startMs).toISOString(), to: new Date(endMs).toISOString() },
      LIMITS.listSize,
    ),
  }));
}
