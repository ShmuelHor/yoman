import { describe, expect, it } from 'vitest';

import type { RollupEntry } from '../../src/domain/rollup.js';
import {
  lastWeekSummary,
  todayReport,
  topAppsBetween,
  weekReport,
} from '../../src/use-cases/read-reports.js';
import { createMemoryStore } from '../memory-store.js';

const JERUSALEM = 'Asia/Jerusalem';
const HOUR_MS = 3_600_000;
const HOUR_SECONDS = 3_600;
/** Doubled: two hours against one the week before. */
const DOUBLED_PCT = 100;

function hourOn(date: string, appId: string, category: string | null): RollupEntry {
  return { date, appId, category, ms: HOUR_MS };
}

describe('read reports', () => {
  it("reports today as the local day, which can be ahead of UTC's", async () => {
    const store = createMemoryStore({ rollups: [hourOn('2026-11-09', 'code', 'work')] });
    // 23:30 UTC on the 8th is 01:30 on the 9th in Jerusalem.
    const now = new Date('2026-11-08T23:30:00.000Z');

    const report = await todayReport(store, now, JERUSALEM);

    expect(report).toMatchObject({ date: '2026-11-09', totalSeconds: HOUR_SECONDS });
  });

  it('summarizes the last complete week, Sunday to Saturday', async () => {
    const store = createMemoryStore({
      rollups: [
        hourOn('2026-11-01', 'code', 'work'),
        hourOn('2026-11-08', 'code', 'work'),
        hourOn('2026-11-14', 'slack', 'chat'),
        hourOn('2026-11-15', 'code', 'work'),
      ],
    });
    // Wednesday 2026-11-18: last week is 2026-11-08 to 2026-11-14.
    const now = new Date('2026-11-18T10:00:00.000Z');

    const summary = await lastWeekSummary(store, now, JERUSALEM);

    expect(summary).toEqual({
      totalSeconds: 2 * HOUR_SECONDS,
      changePct: DOUBLED_PCT,
      topCategory: 'chat',
    });
  });

  it('builds the week from its start and lists top apps over a range', async () => {
    const store = createMemoryStore({
      rollups: [hourOn('2026-11-08', 'code', 'work'), hourOn('2026-11-20', 'vlc', null)],
    });

    const week = await weekReport(store, '2026-11-08', JERUSALEM);
    const top = await topAppsBetween(store, '2026-11-09', '2026-11-21');

    expect(week.days[0]?.totalSeconds).toBe(HOUR_SECONDS);
    expect(week.summary.totalSeconds).toBe(HOUR_SECONDS);
    expect(top).toEqual([{ appId: 'vlc', seconds: HOUR_SECONDS }]);
  });
});
