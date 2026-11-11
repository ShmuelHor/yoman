import { AppId, Category } from '@yoman/shared/common';
import { type Goal, GoalInput } from '@yoman/shared/goals';
import { z } from 'zod';

import { WEEK } from './weekdays.js';

export type TargetKind = 'app' | 'category';

/**
 * The goal as the form edits it: the target is one `kind` with a text field
 * per kind, because a form cannot hold a discriminated union. It transforms
 * into the contract's `GoalInput`, and a problem in the chosen target is
 * reported on that field.
 */
export const GoalForm = z
  .object({
    type: GoalInput.shape.type,
    kind: z.enum(['app', 'category']),
    appId: z.string(),
    category: z.string().trim(),
    minutes: GoalInput.shape.minutes,
    days: GoalInput.shape.days,
  })
  .transform((form, ctx): GoalInput => {
    const target =
      form.kind === 'app' ? AppId.safeParse(form.appId) : Category.safeParse(form.category);
    if (!target.success) {
      ctx.issues.push({
        code: 'custom',
        message: 'invalid target',
        path: [form.kind === 'app' ? 'appId' : 'category'],
        input: form.kind === 'app' ? form.appId : form.category,
      });
      return z.NEVER;
    }
    return GoalInput.parse({
      type: form.type,
      target:
        form.kind === 'app'
          ? { kind: 'app', appId: target.data }
          : { kind: 'category', category: target.data },
      minutes: form.minutes,
      days: form.days,
    });
  });
export type GoalFormInput = z.input<typeof GoalForm>;

/** What a new goal starts as: at most 60 minutes of a category on every day. */
export const NEW_GOAL_FORM: GoalFormInput = {
  type: 'max',
  kind: 'category',
  appId: '',
  category: '',
  minutes: 60,
  days: [...WEEK],
};

/** The form values of an existing goal. */
export function goalToForm(goal: Goal): GoalFormInput {
  const { target } = goal;
  return {
    type: goal.type,
    kind: target.kind,
    appId: target.kind === 'app' ? target.appId : '',
    category: target.kind === 'category' ? target.category : '',
    minutes: goal.minutes,
    days: [...goal.days],
  };
}
