import { LIMITS } from '@yoman/shared/limits';
import type { CulpritSummary } from '@yoman/shared/system';

import type { SystemStore } from './store.js';

const MS_PER_DAY = 86_400_000;

/**
 * The processes blamed most often in incidents that started in the last
 * `days` days, most first. A count is reported up to the list size, the
 * contract's bound, which is already far past anything worth ranking.
 */
export async function listCulprits(
  store: SystemStore,
  days: number,
  nowMs: number,
): Promise<CulpritSummary[]> {
  const counts = await store.transaction((tx) =>
    tx.culpritCounts(nowMs - days * MS_PER_DAY, LIMITS.listSize),
  );
  return counts.map((count) => ({
    ...count,
    incidents: Math.min(count.incidents, LIMITS.listSize),
  }));
}
