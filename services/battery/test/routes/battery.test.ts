import { BatteryNow, HealthTrend, PowerByApp } from '@yoman/shared/battery';
import type { BatterySample } from '@yoman/shared/ingest';
import { afterEach, describe, expect, it } from 'vitest';

import { healthPct } from '../../src/domain/health.js';
import { localDateOf } from '../../src/domain/local-time.js';
import type { StoredSample } from '../../src/use-cases/store.js';
import { batterySample } from '../fixtures.js';
import { createMemoryStore } from '../memory-store.js';
import { createTestService, type TestService, TIME_ZONE } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
/** 27 Wh left (half of 54) at 10 W. */
const MINUTES_REMAINING = 162;
const HEALTH_PCT = 90;
const CYCLES = 312;
const DRAW_W = 10;
const HEAVY_W = 20;
const TEN_MINUTES_S = 600;
const TREND_DAYS = 7;

function stored(clock: string, overrides: Partial<BatterySample> = {}): StoredSample {
  const sample = batterySample(clock, overrides);
  return {
    ...sample,
    tsMs: Date.parse(sample.ts),
    date: localDateOf(Date.parse(sample.ts), TIME_ZONE),
    healthPct: healthPct(sample.energyFullWh, sample.energyFullDesignWh),
  };
}

function day(date: string): { date: string; healthPct: number; cycles: number; averageW: number } {
  return { date, healthPct: HEALTH_PCT, cycles: CYCLES, averageW: DRAW_W };
}

describe('battery routes', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  describe('GET /now', () => {
    it('answers with the newest sample and the time remaining, valid against the contract', async () => {
      subject = createTestService(
        createMemoryStore({ samples: [stored('09:40'), stored('09:50')] }),
      );

      const response = await subject.service.app.inject({ method: 'GET', url: '/now' });

      expect(response.statusCode).toBe(HTTP_OK);
      expect(BatteryNow.parse(response.json())).toEqual({
        ts: '2026-11-08T09:50:00.000Z',
        capacityPct: 50,
        status: 'discharging',
        powerW: DRAW_W,
        minutesRemaining: MINUTES_REMAINING,
        healthPct: HEALTH_PCT,
      });
    });

    it('answers null when no battery ever reported', async () => {
      subject = createTestService();

      const response = await subject.service.app.inject({ method: 'GET', url: '/now' });

      expect(response.statusCode).toBe(HTTP_OK);
      expect(BatteryNow.nullable().parse(response.json())).toBeNull();
    });
  });

  describe('GET /health-trend', () => {
    it('lists the days of the window up to today, oldest first', async () => {
      const days = [day('2026-11-08'), day('2026-10-01'), day('2026-11-02')];
      subject = createTestService(createMemoryStore({ days }));

      const response = await subject.service.app.inject({
        method: 'GET',
        url: `/health-trend?days=${TREND_DAYS}`,
      });

      expect(response.statusCode).toBe(HTTP_OK);
      expect(HealthTrend.parse(response.json()).items.map((item) => item.date)).toEqual([
        '2026-11-02',
        '2026-11-08',
      ]);
    });

    it.each([
      ['a missing days', '/health-trend'],
      ['zero days', '/health-trend?days=0'],
      ['over a year', '/health-trend?days=366'],
      ['a fraction', '/health-trend?days=1.5'],
      ['a non-number', "/health-trend?days=1'%20OR%201=1"],
    ])('rejects %s with 400', async (_case, url) => {
      subject = createTestService();

      const response = await subject.service.app.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
    });
  });

  describe('POST /power-by-app', () => {
    const range = { from: '2026-11-08T09:00:00.000Z', to: '2026-11-08T10:00:00.000Z' };
    const sessions = [
      { appId: 'code', start: '2026-11-08T09:00:00.000Z', end: '2026-11-08T09:10:00.000Z' },
      { appId: 'firefox', start: '2026-11-08T09:10:00.000Z', end: '2026-11-08T09:20:00.000Z' },
    ];

    it('attributes the draw to the apps in focus, valid against the contract', async () => {
      subject = createTestService(
        createMemoryStore({
          samples: [stored('09:05'), stored('09:15', { powerW: HEAVY_W })],
        }),
      );

      const response = await subject.service.app.inject({
        method: 'POST',
        url: '/power-by-app',
        payload: { ...range, sessions },
      });

      expect(response.statusCode).toBe(HTTP_OK);
      expect(PowerByApp.parse(response.json()).items).toEqual([
        { appId: 'firefox', averageW: HEAVY_W, seconds: TEN_MINUTES_S },
        { appId: 'code', averageW: DRAW_W, seconds: TEN_MINUTES_S },
      ]);
    });

    it.each([
      ['a missing range', { sessions }],
      ['a reversed range', { from: range.to, to: range.from, sessions }],
      [
        'a session ending before it starts',
        { ...range, sessions: [{ ...sessions[0], end: range.from, start: range.to }] },
      ],
      ['a bad app id', { ...range, sessions: [{ ...sessions[0], appId: 'code; rm -rf' }] }],
      ['a session title', { ...range, sessions: [{ ...sessions[0], title: 'secret.txt' }] }],
    ])('rejects %s with 400', async (_case, payload) => {
      subject = createTestService();

      const response = await subject.service.app.inject({
        method: 'POST',
        url: '/power-by-app',
        payload,
      });

      expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
    });
  });
});
