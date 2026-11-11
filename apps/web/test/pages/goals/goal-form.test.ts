import { goalFixture } from '@yoman/shared/fixtures/data';
import { describe, expect, it } from 'vitest';

import { GoalForm, goalToForm, NEW_GOAL_FORM } from '../../../src/pages/goals/goal-form.js';

describe('GoalForm', () => {
  it('turns a category form into a goal with a category target', () => {
    const result = GoalForm.parse({ ...NEW_GOAL_FORM, category: ' social ' });

    expect(result.target).toEqual({ kind: 'category', category: 'social' });
  });

  it('turns an app form into a goal with an app target', () => {
    const result = GoalForm.parse({ ...NEW_GOAL_FORM, kind: 'app', appId: 'firefox' });

    expect(result.target).toEqual({ kind: 'app', appId: 'firefox' });
  });

  it('reports a bad category on the category field', () => {
    const result = GoalForm.safeParse({ ...NEW_GOAL_FORM, category: 'Not A Slug' });

    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['category']]);
  });

  it('reports a missing app on the app field', () => {
    const result = GoalForm.safeParse({ ...NEW_GOAL_FORM, kind: 'app', appId: '' });

    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['appId']]);
  });

  it('rejects a goal with no days or with minutes out of range', () => {
    const result = GoalForm.safeParse({
      ...NEW_GOAL_FORM,
      category: 'social',
      days: [],
      minutes: 0,
    });

    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(['days', 'minutes']);
  });

  it('round-trips an existing goal', () => {
    const form = goalToForm(goalFixture);

    expect(GoalForm.parse(form)).toEqual({
      type: goalFixture.type,
      target: goalFixture.target,
      minutes: goalFixture.minutes,
      days: goalFixture.days,
    });
  });
});
