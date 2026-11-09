import { ConflictError, NotFoundError } from '@yoman/service-kit/errors';
import type { GoalInput } from '@yoman/shared/goals';
import { describe, expect, it } from 'vitest';

import { createGoal, deleteGoal, MAX_GOALS, updateGoal } from '../../src/use-cases/manage-goals.js';
import { createMemoryStore } from '../memory-store.js';

const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';
const ID_SUFFIX_LENGTH = 12;
const TARGET = 30;

const input: GoalInput = {
  type: 'max',
  target: { kind: 'category', category: 'social' },
  minutes: TARGET,
  days: [0],
};

describe('goal changes', () => {
  it('refuses a goal beyond the list limit and stores nothing', async () => {
    const goals = Array.from({ length: MAX_GOALS }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(ID_SUFFIX_LENGTH, '0')}`,
      ...input,
    }));
    const store = createMemoryStore({ goals });

    await expect(createGoal(store, input)).rejects.toBeInstanceOf(ConflictError);
    expect(store.state().goals).toHaveLength(MAX_GOALS);
  });

  it('reports a missing goal as not found', async () => {
    const store = createMemoryStore();

    await expect(updateGoal(store, MISSING_ID, input)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteGoal(store, MISSING_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});
