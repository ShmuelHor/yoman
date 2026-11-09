import { AppTotal, DayReport, WeeklySummary, WeekReport } from '@yoman/shared/reports';
import { afterEach, describe, expect, it } from 'vitest';

import { TopAppList } from '../../src/contracts.js';
import type { RollupEntry } from '../../src/domain/rollup.js';
import { createMemoryStore } from '../memory-store.js';
import { createTestService, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HOUR_MS = 3_600_000;
const HOUR_SECONDS = 3_600;

function hourOn(date: string, appId: string, category: string | null): RollupEntry {
  return { date, appId, category, ms: HOUR_MS };
}

const rollups = [
  hourOn('2026-11-01', 'code', 'work'),
  hourOn('2026-11-09', 'code', 'work'),
  hourOn('2026-11-09', 'firefox', null),
  hourOn('2026-11-18', 'slack', 'chat'),
];

const streaks = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    category: 'work',
    startMs: Date.parse('2026-11-18T07:00:00.000Z'),
    endMs: Date.parse('2026-11-18T08:30:00.000Z'),
  },
];

describe('report routes', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  async function get(url: string): Promise<{ status: number; body: unknown }> {
    subject = createTestService(createMemoryStore({ rollups, streaks }));
    const response = await subject.service.app.inject({ method: 'GET', url });
    return { status: response.statusCode, body: response.json() };
  }

  it('GET /today answers a DayReport for the local day', async () => {
    const { status, body } = await get('/today');

    expect(status).toBe(HTTP_OK);
    expect(DayReport.parse(body)).toMatchObject({
      date: '2026-11-18',
      totalSeconds: HOUR_SECONDS,
      longestFocusStreakSeconds: HOUR_SECONDS + HOUR_SECONDS / 2,
    });
  });

  it('GET /week answers a WeekReport of seven days', async () => {
    const { status, body } = await get('/week?start=2026-11-08');

    expect(status).toBe(HTTP_OK);
    const report = WeekReport.parse(body);
    expect(report.summary).toEqual({
      totalSeconds: 2 * HOUR_SECONDS,
      changePct: 100,
      topCategory: 'work',
    });
  });

  it('GET /top-apps answers AppTotals over whole days', async () => {
    const { status, body } = await get('/top-apps?from=2026-11-09&to=2026-11-10');

    expect(status).toBe(HTTP_OK);
    const items = TopAppList.parse(body).items.map((item) => AppTotal.parse(item));
    expect(items).toEqual([
      { appId: 'code', seconds: HOUR_SECONDS },
      { appId: 'firefox', seconds: HOUR_SECONDS },
    ]);
  });

  it('GET /weekly-summary answers a WeeklySummary of last week', async () => {
    const { status, body } = await get('/weekly-summary');

    expect(status).toBe(HTTP_OK);
    expect(WeeklySummary.parse(body)).toEqual({
      totalSeconds: 2 * HOUR_SECONDS,
      changePct: 100,
      topCategory: 'work',
    });
  });

  it.each([
    ['a week without a start', '/week'],
    ['a week start that is not a date', "/week?start=2026-11-08'%20OR%20'1'='1"],
    ['a week start in year 9999', '/week?start=9999-12-31'],
    ['a reversed range', '/top-apps?from=2026-11-10&to=2026-11-09'],
    ['a range over 92 days', '/top-apps?from=2026-01-01&to=2026-11-09'],
    ['timestamps for days', '/top-apps?from=2026-11-09T00:00:00Z&to=2026-11-10T00:00:00Z'],
  ])('rejects %s with 400', async (_case, url) => {
    const { status } = await get(url);

    expect(status).toBe(HTTP_BAD_REQUEST);
  });
});
