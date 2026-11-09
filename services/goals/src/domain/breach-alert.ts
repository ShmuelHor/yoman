import type { Alert, AlertLevel } from '@yoman/shared/alerts';
import type { Goal } from '@yoman/shared/goals';

/** The default; focus's `alert_policy` decides the level a user actually gets (SPEC §5 focus). */
export const GOAL_BREACH_LEVEL: AlertLevel = 'normal';

/** A goal breached on a date, with the minutes that breached it. */
export interface Breach {
  readonly goal: Goal;
  readonly date: string;
  readonly minutesUsed: number;
}

/**
 * The key names the goal and the day, so focus's rate limit can never fold two
 * days, or two goals, into one alert.
 */
export function breachAlertKey(goalId: string, date: string): string {
  return `goal-breach:${goalId}:${date}`;
}

/** The `goal-breach` alert, with the params its notification interpolates. */
export function breachAlert(breach: Breach, now: Date): Alert {
  const { goal } = breach;
  return {
    alertKey: breachAlertKey(goal.id, breach.date),
    type: 'goal-breach',
    level: GOAL_BREACH_LEVEL,
    ts: now.toISOString(),
    params: {
      target: goal.target.kind === 'app' ? goal.target.appId : goal.target.category,
      minutesUsed: breach.minutesUsed,
      targetMinutes: goal.minutes,
    },
  };
}
