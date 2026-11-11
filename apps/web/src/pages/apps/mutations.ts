import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import type { App, AppUpdate, Rule, RuleInput } from '@yoman/shared/sessions';

import type { GatewayClient } from '../../api/gateway.js';

/**
 * A rule or an app category changes how sessions are categorized, so every
 * view that shows categories is refreshed after a write.
 */
const AFFECTED_QUERIES = ['listApps', 'listRules', 'dashboardToday', 'week'] as const;

interface RuleUpdate {
  readonly id: string;
  readonly body: RuleInput;
}

interface AppChange {
  readonly id: string;
  readonly body: AppUpdate;
}

export interface AppsMutations {
  readonly updateApp: UseMutationResult<App, Error, AppChange>;
  readonly createRule: UseMutationResult<Rule, Error, RuleInput>;
  readonly updateRule: UseMutationResult<Rule, Error, RuleUpdate>;
  readonly deleteRule: UseMutationResult<undefined, Error, string>;
}

/** Every write of the Apps page. Each one announces its success with a toast (`meta.successMessage`). */
export function useAppsMutations(client: GatewayClient): AppsMutations {
  const queryClient = useQueryClient();
  const refresh = async (): Promise<void> => {
    await Promise.all(
      AFFECTED_QUERIES.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };

  const updateApp = useMutation({
    mutationFn: ({ id, body }: AppChange) => client.request('updateApp', { params: { id }, body }),
    meta: { successMessage: 'apps:toast.appSaved' },
    onSuccess: refresh,
  });
  const createRule = useMutation({
    mutationFn: (body: RuleInput) => client.request('createRule', { body }),
    meta: { successMessage: 'apps:toast.ruleCreated' },
    onSuccess: refresh,
  });
  const updateRule = useMutation({
    mutationFn: ({ id, body }: RuleUpdate) =>
      client.request('updateRule', { params: { id }, body }),
    meta: { successMessage: 'apps:toast.ruleSaved' },
    onSuccess: refresh,
  });
  const deleteRule = useMutation({
    mutationFn: (id: string) => client.request('deleteRule', { params: { id } }),
    meta: { successMessage: 'apps:toast.ruleDeleted' },
    onSuccess: refresh,
  });
  return { updateApp, createRule, updateRule, deleteRule };
}
