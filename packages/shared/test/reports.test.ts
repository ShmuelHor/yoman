import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src/limits.js';
import { DayReport, WeekQuery, WeekReport } from '../src/reports.js';

const day = {
  date: '2026-11-08',
  totalSeconds: 3600,
  byCategory: [
    { category: 'work', seconds: 3000 },
    { category: null, seconds: 600 },
  ],
  topApps: [{ appId: 'code', seconds: 3000 }],
  longestFocusStreakSeconds: 1800,
};
const week = {
  start: '2026-11-08',
  days: Array(LIMITS.daysPerWeek).fill(day),
  topApps: [],
  summary: { totalSeconds: 25200, changePct: -12.5, topCategory: 'work' },
};

describe('reports', () => {
  it('accepts a day, a week and a week query', () => {
    expect(DayReport.safeParse(day).success).toBe(true);
    expect(WeekReport.safeParse(week).success).toBe(true);
    expect(WeekQuery.safeParse({ start: '2026-11-08' }).success).toBe(true);
  });

  it('rejects negative totals, a short week and a bad start', () => {
    expect(DayReport.safeParse({ ...day, totalSeconds: -1 }).success).toBe(false);
    expect(WeekReport.safeParse({ ...week, days: [day] }).success).toBe(false);
    expect(WeekQuery.safeParse({ start: 'monday' }).success).toBe(false);
  });
});
