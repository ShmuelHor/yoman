import type { Goal } from '@yoman/shared/goals';
import { describe, expect, it } from 'vitest';

import type { DayTotals } from '../../src/contracts.js';
import { evaluateTotals } from '../../src/use-cases/evaluate-totals.js';
import { deleteGoal } from '../../src/use-cases/manage-goals.js';
import { createMemoryStore } from '../memory-store.js';

const NOW = new Date('2026-11-09T07:00:00.000Z');
const SUNDAY = '2026-11-08';
const MONDAY = '2026-11-09';
/** 0 is Sunday. */
const EVERY_DAY = Array.from({ length: 7 }, (_, day) => day);
const TARGET = 30;
const MINUTE = 60;
const OVER = (TARGET + 1) * MINUTE;
const UNDER = (TARGET - 1) * MINUTE;

const maxSocial: Goal = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'max',
  target: { kind: 'category', category: 'social' },
  minutes: TARGET,
  days: EVERY_DAY,
};
const minCode: Goal = {
  id: '00000000-0000-4000-8000-000000000002',
  type: 'min',
  target: { kind: 'app', appId: 'code' },
  minutes: TARGET,
  days: EVERY_DAY,
};

function totals(date: string, social: number, code: number): DayTotals {
  return {
    date,
    apps: [{ appId: 'code', seconds: code }],
    categories: [
      { category: 'social', seconds: social },
      { category: null, seconds: OVER },
    ],
  };
}

function alertKeys(result: Awaited<ReturnType<typeof evaluateTotals>>): string[] {
  return result.breaches.map((alert) => alert.alertKey);
}

describe('evaluateTotals', () => {
  it('alerts once per goal per day, however often the day is evaluated', async () => {
    const store = createMemoryStore({ goals: [maxSocial] });

    const first = await evaluateTotals(store, totals(SUNDAY, OVER, 0), NOW);
    const again = await evaluateTotals(store, totals(SUNDAY, OVER + MINUTE, 0), NOW);

    expect(alertKeys(first)).toEqual([`goal-breach:${maxSocial.id}:${SUNDAY}`]);
    expect(first.breaches[0]?.params).toEqual({
      target: 'social',
      minutesUsed: TARGET + 1,
      targetMinutes: TARGET,
    });
    expect(again.breaches).toEqual([]);
  });

  it('alerts again on the next day', async () => {
    const store = createMemoryStore({ goals: [maxSocial] });

    await evaluateTotals(store, totals(SUNDAY, OVER, 0), NOW);
    const monday = await evaluateTotals(store, totals(MONDAY, OVER, 0), NOW);

    expect(alertKeys(monday)).toEqual([`goal-breach:${maxSocial.id}:${MONDAY}`]);
  });

  it('does not alert while a max goal is within its target', async () => {
    const store = createMemoryStore({ goals: [maxSocial] });

    const result = await evaluateTotals(store, totals(SUNDAY, TARGET * MINUTE, 0), NOW);

    expect(result.breaches).toEqual([]);
  });

  it('breaches an unmet min goal only when the next day is first evaluated', async () => {
    const store = createMemoryStore({ goals: [minCode] });

    const during = await evaluateTotals(store, totals(SUNDAY, 0, UNDER), NOW);
    const nextDay = await evaluateTotals(store, totals(MONDAY, 0, 0), NOW);

    expect(during.breaches).toEqual([]);
    expect(alertKeys(nextDay)).toEqual([`goal-breach:${minCode.id}:${SUNDAY}`]);
  });

  it('does not breach a min goal that was met', async () => {
    const store = createMemoryStore({ goals: [minCode] });

    await evaluateTotals(store, totals(SUNDAY, 0, TARGET * MINUTE), NOW);
    const nextDay = await evaluateTotals(store, totals(MONDAY, 0, 0), NOW);

    expect(nextDay.breaches).toEqual([]);
  });

  it('treats late totals for a day already over as final', async () => {
    const store = createMemoryStore({ goals: [minCode] });
    await evaluateTotals(store, totals(MONDAY, 0, 0), NOW);

    const late = await evaluateTotals(store, totals(SUNDAY, 0, UNDER), NOW);

    expect(alertKeys(late)).toEqual([`goal-breach:${minCode.id}:${SUNDAY}`]);
    expect(store.state().latestDate).toBe(MONDAY);
  });

  it('stores the totals, ignoring uncategorized time', async () => {
    const store = createMemoryStore();

    await evaluateTotals(store, totals(SUNDAY, OVER, UNDER), NOW);

    expect(store.state().usage[SUNDAY]).toEqual({
      apps: { code: UNDER },
      categories: { social: OVER },
    });
  });

  it('lets a goal deleted and created again alert again', async () => {
    const store = createMemoryStore({ goals: [maxSocial] });
    await evaluateTotals(store, totals(SUNDAY, OVER, 0), NOW);

    await deleteGoal(store, maxSocial.id);
    store.state().goals.push(maxSocial);
    const result = await evaluateTotals(store, totals(SUNDAY, OVER, 0), NOW);

    expect(result.breaches).toHaveLength(1);
  });
});
