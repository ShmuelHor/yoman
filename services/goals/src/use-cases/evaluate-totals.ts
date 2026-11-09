import type { DayTotals, EvaluateResult } from '../contracts.js';
import { breachAlert } from '../domain/breach-alert.js';
import { breachesOn, type DayUsage } from '../domain/evaluate-goals.js';
import { MAX_GOALS } from './manage-goals.js';
import type { GoalsStore } from './store.js';

/** Uncategorized time has no goal to count against. */
export function toDayUsage(totals: DayTotals): DayUsage {
  const categories = new Map<string, number>();
  for (const total of totals.categories) {
    if (total.category !== null) {
      categories.set(total.category, total.seconds);
    }
  }
  return { apps: new Map(totals.apps.map((app) => [app.appId, app.seconds])), categories };
}

/**
 * Stores the day's totals and returns an alert for every goal they breach for
 * the first time that day. The first totals of a new day also close the
 * previous evaluated day, which is the only point where a `min` goal that was
 * never reached is known to be breached.
 */
export function evaluateTotals(
  store: GoalsStore,
  totals: DayTotals,
  now: Date,
): Promise<EvaluateResult> {
  return store.transaction(async (tx) => {
    await tx.lockEvaluation();
    const latest = await tx.latestEvaluatedDate();
    const usage = toDayUsage(totals);
    await tx.saveUsage(totals.date, usage);
    const goals = await tx.listGoals(MAX_GOALS);

    // Totals for a day before the latest one are late totals of a day already over.
    const dayOver = latest !== null && totals.date < latest;
    const breaches = breachesOn(goals, totals.date, usage, dayOver);
    if (latest !== null && latest < totals.date) {
      breaches.push(...breachesOn(goals, latest, await tx.usageOn(latest), true));
    }

    const recorded = await tx.recordBreaches(breaches);
    return { breaches: recorded.map((breach) => breachAlert(breach, now)) };
  });
}
