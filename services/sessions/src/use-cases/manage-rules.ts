import { ConflictError, NotFoundError } from '@yoman/service-kit/errors';
import { LIMITS } from '@yoman/shared/limits';
import type { Rule, RuleInput } from '@yoman/shared/sessions';

import { reapplyCategories } from './reapply-categories.js';
import type { SessionsStore } from './store.js';

/** The list contract holds at most this many rules, so no more can be created. */
export const MAX_RULES = LIMITS.listSize;

export function listRules(store: SessionsStore): Promise<Rule[]> {
  return store.transaction((tx) => tx.listRules(MAX_RULES));
}

export function createRule(store: SessionsStore, input: RuleInput, now: Date): Promise<Rule> {
  return store.transaction(async (tx) => {
    if ((await tx.countRules()) >= MAX_RULES) {
      throw new ConflictError('Rule limit reached');
    }
    const rule = await tx.createRule(input);
    await reapplyCategories(tx, now);
    return rule;
  });
}

export function updateRule(
  store: SessionsStore,
  id: string,
  input: RuleInput,
  now: Date,
): Promise<Rule> {
  return store.transaction(async (tx) => {
    const rule = await tx.updateRule(id, input);
    if (rule === null) {
      throw new NotFoundError('Rule not found');
    }
    await reapplyCategories(tx, now);
    return rule;
  });
}

export function deleteRule(store: SessionsStore, id: string, now: Date): Promise<void> {
  return store.transaction(async (tx) => {
    if (!(await tx.deleteRule(id))) {
      throw new NotFoundError('Rule not found');
    }
    await reapplyCategories(tx, now);
  });
}
