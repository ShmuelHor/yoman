import type { Goal, GoalProgressItem, GoalStatus, GoalTarget } from '@yoman/shared/goals';
import { LIMITS } from '@yoman/shared/limits';

const SECONDS_PER_MINUTE = 60;

/** A day's usage in seconds, by app id and by category. */
export interface DayUsage {
  readonly apps: ReadonlyMap<string, number>;
  readonly categories: ReadonlyMap<string, number>;
}

export const EMPTY_USAGE: DayUsage = { apps: new Map(), categories: new Map() };

/** 0 is Sunday. A `LocalDate` names a calendar day, so it is read as UTC to stay zone-free. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

export function appliesOn(goal: Goal, date: string): boolean {
  return goal.days.includes(weekdayOf(date));
}

function secondsSpent(target: GoalTarget, usage: DayUsage): number {
  return target.kind === 'app'
    ? (usage.apps.get(target.appId) ?? 0)
    : (usage.categories.get(target.category) ?? 0);
}

/** Whole minutes, so a `max 30` goal is breached at 31 minutes, never at 30 and a few seconds. */
export function minutesUsed(target: GoalTarget, usage: DayUsage): number {
  const minutes = Math.floor(secondsSpent(target, usage) / SECONDS_PER_MINUTE);
  return Math.min(minutes, LIMITS.minutesPerDay);
}

/**
 * A `max` goal is breached as soon as usage goes over it, and met once the day
 * is over without that. A `min` goal is met as soon as usage reaches it, and
 * breached only once the day is over without that.
 */
export function goalStatus(goal: Goal, used: number, dayOver: boolean): GoalStatus {
  if (goal.type === 'max') {
    if (used > goal.minutes) {
      return 'breached';
    }
    return dayOver ? 'met' : 'on-track';
  }
  if (used >= goal.minutes) {
    return 'met';
  }
  return dayOver ? 'breached' : 'on-track';
}

/** The progress of every goal that applies on `date`, in the order given. */
export function progressOn(
  goals: readonly Goal[],
  date: string,
  usage: DayUsage,
  dayOver: boolean,
): GoalProgressItem[] {
  return goals
    .filter((goal) => appliesOn(goal, date))
    .map((goal) => {
      const used = minutesUsed(goal.target, usage);
      return {
        goalId: goal.id,
        minutesUsed: used,
        targetMinutes: goal.minutes,
        status: goalStatus(goal, used, dayOver),
      };
    });
}
