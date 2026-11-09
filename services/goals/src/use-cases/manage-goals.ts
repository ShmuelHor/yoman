import { ConflictError, NotFoundError } from '@yoman/service-kit/errors';
import type { Goal, GoalInput } from '@yoman/shared/goals';
import { LIMITS } from '@yoman/shared/limits';

import type { GoalsStore } from './store.js';

/** The list contract holds at most this many goals, so no more can be created. */
export const MAX_GOALS = LIMITS.listSize;

export function listGoals(store: GoalsStore): Promise<Goal[]> {
  return store.transaction((tx) => tx.listGoals(MAX_GOALS));
}

export function createGoal(store: GoalsStore, input: GoalInput): Promise<Goal> {
  return store.transaction(async (tx) => {
    if ((await tx.countGoals()) >= MAX_GOALS) {
      throw new ConflictError('Goal limit reached');
    }
    return tx.createGoal(input);
  });
}

export function updateGoal(store: GoalsStore, id: string, input: GoalInput): Promise<Goal> {
  return store.transaction(async (tx) => {
    const goal = await tx.updateGoal(id, input);
    if (goal === null) {
      throw new NotFoundError('Goal not found');
    }
    return goal;
  });
}

/** Its events go with it, so a goal created again later can alert again. */
export function deleteGoal(store: GoalsStore, id: string): Promise<void> {
  return store.transaction(async (tx) => {
    if (!(await tx.deleteGoal(id))) {
      throw new NotFoundError('Goal not found');
    }
  });
}
