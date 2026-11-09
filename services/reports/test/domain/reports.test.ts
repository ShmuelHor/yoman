import { DayReport, WeeklySummary, WeekReport } from '@yoman/shared/reports';
import { describe, expect, it } from 'vitest';

import {
  buildDayReport,
  buildWeeklySummary,
  buildWeekReport,
  previousWeekStart,
  topApps,
} from '../../src/domain/reports.js';
import type { RollupEntry } from '../../src/domain/rollup.js';
import type { Streak } from '../../src/domain/streaks.js';

const JERUSALEM = 'Asia/Jerusalem';
const MS_PER_SECOND = 1_000;
/** 80% more than the week before: 3 hours against 1:40. */
const GROWTH_PCT = 80;

/** An `HH:MM` duration in milliseconds. */
function duration(hoursAndMinutes: string): number {
  return Date.parse(`1970-01-01T${hoursAndMinutes}:00.000Z`);
}

function seconds(hoursAndMinutes: string): number {
  return duration(hoursAndMinutes) / MS_PER_SECOND;
}

function entry(date: string, appId: string, category: string | null, time: string): RollupEntry {
  return { date, appId, category, ms: duration(time) };
}

function streak(start: string, time: string): Streak {
  const startMs = Date.parse(start);
  return { id: null, category: 'work', startMs, endMs: startMs + duration(time) };
}

describe('buildDayReport', () => {
  it('totals the day by category and app, valid against the shared contract', () => {
    const entries = [
      entry('2026-11-08', 'code', 'work', '01:30'),
      entry('2026-11-08', 'terminal', 'work', '00:30'),
      entry('2026-11-08', 'firefox', null, '00:45'),
      entry('2026-11-09', 'code', 'work', '10:00'),
    ];

    const report = DayReport.parse(buildDayReport('2026-11-08', entries, [], JERUSALEM));

    expect(report).toEqual({
      date: '2026-11-08',
      totalSeconds: seconds('02:45'),
      byCategory: [
        { category: 'work', seconds: seconds('02:00') },
        { category: null, seconds: seconds('00:45') },
      ],
      topApps: [
        { appId: 'code', seconds: seconds('01:30') },
        { appId: 'firefox', seconds: seconds('00:45') },
        { appId: 'terminal', seconds: seconds('00:30') },
      ],
      longestFocusStreakSeconds: 0,
    });
  });

  it('counts a streak on the local day it started, even when it runs past midnight', () => {
    // 23:00 to 01:00 in Jerusalem: two hours, all of them the 8th's.
    const lateNight = streak('2026-11-08T21:00:00.000Z', '02:00');
    const morning = streak('2026-11-09T06:00:00.000Z', '00:30');

    const eighth = buildDayReport('2026-11-08', [], [lateNight, morning], JERUSALEM);
    const ninth = buildDayReport('2026-11-09', [], [lateNight, morning], JERUSALEM);

    expect(eighth.longestFocusStreakSeconds).toBe(seconds('02:00'));
    expect(ninth.longestFocusStreakSeconds).toBe(seconds('00:30'));
  });

  it('is empty for a day with no time', () => {
    expect(buildDayReport('2026-11-08', [], [], JERUSALEM)).toEqual({
      date: '2026-11-08',
      totalSeconds: 0,
      byCategory: [],
      topApps: [],
      longestFocusStreakSeconds: 0,
    });
  });
});

describe('topApps', () => {
  it('rounds to whole seconds', () => {
    const almostTwoSeconds = { date: '2026-11-08', appId: 'code', category: null, ms: 1_500 };

    expect(topApps([almostTwoSeconds])).toEqual([{ appId: 'code', seconds: 2 }]);
  });

  it('orders equal totals by app, so row order never changes the report', () => {
    const entries = [
      entry('2026-11-08', 'slack', null, '00:10'),
      entry('2026-11-08', 'code', null, '00:10'),
    ];

    expect(topApps(entries).map((total) => total.appId)).toEqual(['code', 'slack']);
  });
});

describe('buildWeeklySummary', () => {
  it('compares the week with the one before and names the top category', () => {
    const entries = [
      entry('2026-11-01', 'code', 'work', '01:40'),
      entry('2026-11-08', 'code', 'work', '01:00'),
      entry('2026-11-10', 'slack', 'chat', '00:30'),
      entry('2026-11-11', 'firefox', null, '01:30'),
      entry('2026-11-15', 'code', 'work', '09:00'),
    ];

    const summary = WeeklySummary.parse(buildWeeklySummary('2026-11-08', entries));

    expect(summary).toEqual({
      totalSeconds: seconds('03:00'),
      changePct: GROWTH_PCT,
      topCategory: 'work',
    });
  });

  it('has no change when the week before is empty, and no top category without one', () => {
    const summary = buildWeeklySummary('2026-11-08', [entry('2026-11-09', 'code', null, '00:10')]);

    expect(summary).toEqual({ totalSeconds: seconds('00:10'), changePct: null, topCategory: null });
  });
});

describe('buildWeekReport', () => {
  it('has seven days from the start, valid against the shared contract', () => {
    const entries = [
      entry('2026-11-07', 'code', 'work', '05:00'),
      entry('2026-11-09', 'code', 'work', '01:00'),
      entry('2026-11-14', 'vlc', null, '00:30'),
    ];

    const report = WeekReport.parse(buildWeekReport('2026-11-08', entries, [], JERUSALEM));

    expect(report.days.map((day) => [day.date, day.totalSeconds])).toEqual([
      ['2026-11-08', 0],
      ['2026-11-09', seconds('01:00')],
      ['2026-11-10', 0],
      ['2026-11-11', 0],
      ['2026-11-12', 0],
      ['2026-11-13', 0],
      ['2026-11-14', seconds('00:30')],
    ]);
    expect(report.topApps).toEqual([
      { appId: 'code', seconds: seconds('01:00') },
      { appId: 'vlc', seconds: seconds('00:30') },
    ]);
  });
});

describe('previousWeekStart', () => {
  it.each([
    ['a Sunday', '2026-11-15'],
    ['a Wednesday', '2026-11-18'],
    ['a Saturday', '2026-11-21'],
  ])('is the Sunday that starts the week before, from %s', (_case, today) => {
    expect(previousWeekStart(today)).toBe('2026-11-08');
  });
});
