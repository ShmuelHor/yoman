import type { Goal, GoalInput } from '@yoman/shared/goals';

import type { Breach } from '../domain/breach-alert.js';
import type { DayUsage } from '../domain/evaluate-goals.js';

/**
 * Everything the use cases need from storage, inside one transaction. The
 * Postgres adapter implements it; tests use an in-memory one.
 */
export interface GoalsTransaction {
  readonly listGoals: (limit: number) => Promise<Goal[]>;
  readonly countGoals: () => Promise<number>;
  readonly createGoal: (input: GoalInput) => Promise<Goal>;
  /** `null` when there is no such goal. */
  readonly updateGoal: (id: string, input: GoalInput) => Promise<Goal | null>;
  /** `false` when there is no such goal. */
  readonly deleteGoal: (id: string) => Promise<boolean>;

  /** Blocks other evaluations until the transaction ends, so two never interleave. */
  readonly lockEvaluation: () => Promise<void>;
  /** The newest day ever evaluated, or `null` before the first evaluation. */
  readonly latestEvaluatedDate: () => Promise<string | null>;
  /** The stored totals of a day; empty when there are none. */
  readonly usageOn: (date: string) => Promise<DayUsage>;
  /** Replaces the stored totals of a day. */
  readonly saveUsage: (date: string, usage: DayUsage) => Promise<void>;
  /**
   * Records breaches as events and returns the ones not recorded before, so a
   * goal alerts at most once a day. Breaches of goals deleted since are dropped.
   */
  readonly recordBreaches: (breaches: readonly Breach[]) => Promise<Breach[]>;
}

export interface GoalsStore {
  /** Runs `work` in one transaction: committed when it resolves, rolled back when it throws. */
  readonly transaction: <T>(work: (tx: GoalsTransaction) => Promise<T>) => Promise<T>;
}
