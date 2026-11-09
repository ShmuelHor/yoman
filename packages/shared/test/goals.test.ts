import { describe, expect, it } from 'vitest';
import { Goal, GoalInput, GoalList, GoalProgress } from '../src/goals.js';
import { LIMITS } from '../src/limits.js';

const id = '0b7f8c3e-2c55-4b8e-9f3e-1d2a3b4c5d6e';
const input = {
  type: 'max',
  target: { kind: 'category', category: 'social' },
  minutes: 30,
  days: [0, 1, 2],
};

describe('goals', () => {
  it('accepts a goal input, a goal, a list and progress', () => {
    expect(GoalInput.safeParse(input).success).toBe(true);
    expect(GoalInput.safeParse({ ...input, target: { kind: 'app', appId: 'slack' } }).success).toBe(
      true,
    );
    expect(Goal.safeParse({ id, ...input }).success).toBe(true);
    expect(GoalList.safeParse({ items: [] }).success).toBe(true);
    expect(
      GoalProgress.safeParse({
        date: '2026-11-08',
        items: [{ goalId: id, minutesUsed: 40, targetMinutes: 30, status: 'breached' }],
      }).success,
    ).toBe(true);
  });

  it('rejects bad types, targets, minutes and days', () => {
    expect(GoalInput.safeParse({ ...input, type: 'exact' }).success).toBe(false);
    expect(GoalInput.safeParse({ ...input, target: { kind: 'app', category: 'x' } }).success).toBe(
      false,
    );
    expect(GoalInput.safeParse({ ...input, minutes: 0 }).success).toBe(false);
    expect(GoalInput.safeParse({ ...input, minutes: 1441 }).success).toBe(false);
    expect(GoalInput.safeParse({ ...input, days: [] }).success).toBe(false);
    expect(GoalInput.safeParse({ ...input, days: [LIMITS.daysPerWeek] }).success).toBe(false);
    expect(GoalInput.safeParse({ ...input, days: [1, 1] }).success).toBe(false);
  });
});
