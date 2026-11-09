import type { TimeRangeQuery } from '@yoman/shared/common';
import { LIMITS } from '@yoman/shared/limits';
import type { Incident } from '@yoman/shared/system';

import type { SystemStore } from './store.js';

/** Incidents overlapping `[from, to)`, oldest first, open ones included. */
export function listIncidents(store: SystemStore, range: TimeRangeQuery): Promise<Incident[]> {
  return store.transaction((tx) => tx.listIncidents(range, LIMITS.listSize));
}
