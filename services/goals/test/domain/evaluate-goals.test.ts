import type { Goal } from '@yoman/shared/goals';
import { describe, expect, it } from 'vitest';

import {
  appliesOn,
  type DayUsage,
  EMPTY_USAGE,
  goalStatus,
  minutesUsed,
  progressOn,
  weekdayOf,
} from '../../src/domain/evaluate-goals.js';

const SUNDAY = '2026-11-08';
const MONDAY = '2026-11-09';
const SATURDAY = '2026-11-14';
const SUN = 0;
const MON = 1;
const TUE = 2;
const WED = 3;
const THU = 4;
const FRI = 5;
const SAT = 6;
const EVERY_DAY = [SUN, MON, TUE, WED, THU, FRI, SAT];
const WORKDAYS = [MON, TUE, WED, THU, FRI];
const TARGET = 30;
const MINUTE = 60;
const MINUTES_PER_DAY = 1_440;

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'max',
    target: { kind: 'category', category: 'social' },
    minutes: TARGET,
    days: EVERY_DAY,
    ...overrides,
  };
}

function usage(apps: Record<string, number>, categories: Record<string, number> = {}): DayUsage {
  return { apps: new Map(Object.entries(apps)), categories: new Map(Object.entries(categories)) };
}

describe('weekdayOf', () => {
  it('reads a calendar date the same in every time zone', () => {
    expect(weekdayOf(SUNDAY)).toBe(SUN);
    expect(weekdayOf(MONDAY)).toBe(MON);
    expect(weekdayOf(SATURDAY)).toBe(SAT);
  });
});

describe('appliesOn', () => {
  it('applies a goal only on its days of the week', () => {
    const workdays = goal({ days: WORKDAYS });

    expect(appliesOn(workdays, MONDAY)).toBe(true);
    expect(appliesOn(workdays, SUNDAY)).toBe(false);
  });
});

describe('minutesUsed', () => {
  it('counts whole minutes of the app or the category the goal targets', () => {
    const day = usage({ slack: TARGET * MINUTE - 1 }, { social: TARGET * MINUTE + MINUTE });

    expect(minutesUsed({ kind: 'app', appId: 'slack' }, day)).toBe(TARGET - 1);
    expect(minutesUsed({ kind: 'category', category: 'social' }, day)).toBe(TARGET + 1);
    expect(minutesUsed({ kind: 'app', appId: 'code' }, day)).toBe(0);
  });

  it('never reports more than a day', () => {
    const day = usage({ slack: (MINUTES_PER_DAY + TARGET) * MINUTE });

    expect(minutesUsed({ kind: 'app', appId: 'slack' }, day)).toBe(MINUTES_PER_DAY);
  });
});

describe('goalStatus', () => {
  it.each([
    ['max', TARGET, false, 'on-track'],
    ['max', TARGET + 1, false, 'breached'],
    ['max', TARGET, true, 'met'],
    ['max', TARGET + 1, true, 'breached'],
    ['min', TARGET - 1, false, 'on-track'],
    ['min', TARGET, false, 'met'],
    ['min', TARGET - 1, true, 'breached'],
    ['min', TARGET, true, 'met'],
  ] as const)('a %s goal at %i minutes, day over: %s, is %s', (type, used, dayOver, status) => {
    expect(goalStatus(goal({ type }), used, dayOver)).toBe(status);
  });
});

describe('progressOn', () => {
  it('reports every goal that applies on the date, and skips the others', () => {
    const social = goal();
    const workdaysCode = goal({
      id: '00000000-0000-4000-8000-000000000002',
      type: 'min',
      target: { kind: 'app', appId: 'code' },
      days: WORKDAYS,
    });
    const used = TARGET + TARGET / 2;

    const progress = progressOn(
      [social, workdaysCode],
      SUNDAY,
      usage({}, { social: used * MINUTE }),
      false,
    );

    expect(progress).toEqual([
      { goalId: social.id, minutesUsed: used, targetMinutes: TARGET, status: 'breached' },
    ]);
  });

  it('reports a day with no usage as zero minutes', () => {
    const progress = progressOn([goal({ type: 'min' })], SUNDAY, EMPTY_USAGE, true);

    expect(progress).toEqual([
      { goalId: goal().id, minutesUsed: 0, targetMinutes: TARGET, status: 'breached' },
    ]);
  });
});
