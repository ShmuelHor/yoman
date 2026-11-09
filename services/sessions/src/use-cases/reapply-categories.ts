import { LIMITS } from '@yoman/shared/limits';

import { reapplyCutoff, recategorize } from '../domain/categorize.js';
import type { SessionsTransaction } from './store.js';

/**
 * Re-categorizes the last 30 days of sessions after a rule or an app's
 * category changed, inside the caller's transaction so the change and its
 * effect commit together. Returns how many sessions changed.
 */
export async function reapplyCategories(tx: SessionsTransaction, now: Date): Promise<number> {
  const sessions = await tx.sessionsEndingSince(reapplyCutoff(now));
  const rules = await tx.listRules(LIMITS.listSize);
  const changes = recategorize(sessions, rules, await tx.appCategories());
  if (changes.length > 0) {
    await tx.setCategories(changes);
  }
  return changes.length;
}
