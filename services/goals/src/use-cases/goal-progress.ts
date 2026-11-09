import type { GoalProgress } from '@yoman/shared/goals';

import { progressOn } from '../domain/evaluate-goals.js';
import { MAX_GOALS } from './manage-goals.js';
import type { GoalsStore } from './store.js';

/**
 * The progress of every goal that applies on `date`, from the totals last
 * evaluated for it. A day is over once a later day has been evaluated.
 */
export function goalProgress(store: GoalsStore, date: string): Promise<GoalProgress> {
  return store.transaction(async (tx) => {
    const latest = await tx.latestEvaluatedDate();
    const usage = await tx.usageOn(date);
    const goals = await tx.listGoals(MAX_GOALS);
    const dayOver = latest !== null && date < latest;
    return { date, items: progressOn(goals, date, usage, dayOver) };
  });
}
