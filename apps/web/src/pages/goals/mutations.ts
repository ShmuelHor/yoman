import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Goal, GoalInput } from '@yoman/shared/goals';

import type { GatewayClient } from '../../api/gateway.js';

/** A goal change moves today's progress too, so both lists are refreshed after a write. */
const AFFECTED_QUERIES = ['listGoals', 'goalProgress'] as const;

interface GoalUpdate {
  readonly id: string;
  readonly body: GoalInput;
}

export interface GoalsMutations {
  readonly createGoal: UseMutationResult<Goal, Error, GoalInput>;
  readonly updateGoal: UseMutationResult<Goal, Error, GoalUpdate>;
  readonly deleteGoal: UseMutationResult<undefined, Error, string>;
}

/** Every write of the Goals page. Each one announces its success with a toast (`meta.successMessage`). */
export function useGoalsMutations(client: GatewayClient): GoalsMutations {
  const queryClient = useQueryClient();
  const refresh = async (): Promise<void> => {
    await Promise.all(
      AFFECTED_QUERIES.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };

  const createGoal = useMutation({
    mutationFn: (body: GoalInput) => client.request('createGoal', { body }),
    meta: { successMessage: 'goals:toast.created' },
    onSuccess: refresh,
  });
  const updateGoal = useMutation({
    mutationFn: ({ id, body }: GoalUpdate) =>
      client.request('updateGoal', { params: { id }, body }),
    meta: { successMessage: 'goals:toast.saved' },
    onSuccess: refresh,
  });
  const deleteGoal = useMutation({
    mutationFn: (id: string) => client.request('deleteGoal', { params: { id } }),
    meta: { successMessage: 'goals:toast.deleted' },
    onSuccess: refresh,
  });
  return { createGoal, updateGoal, deleteGoal };
}
