import { sessionFixture } from '@yoman/shared/fixtures/data';
import { requestFixtures } from '@yoman/shared/fixtures/requests';
import { responseFixtures } from '@yoman/shared/fixtures/responses';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { ServiceUnavailableError } from '../../../src/core/errors.js';
import { handlers } from '../../../src/routes/battery/index.js';
import { STATUS } from '../../harness.js';
import { routeHarness } from '../route-harness.js';

const range = requestFixtures.batteryPowerByApp.query ?? {};
const rangeQuery = new URLSearchParams(range).toString();

describe('battery routes', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('returns the current battery reading', async () => {
    const harness = await routeHarness(handlers, {
      'battery GET /now': responseFixtures.batteryNow,
    });
    app = harness.app;

    const response = await app.inject({
      method: 'GET',
      url: '/v1/battery/now',
      headers: harness.headers,
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual(responseFixtures.batteryNow);
  });

  it('returns null for a device without a battery', async () => {
    const harness = await routeHarness(handlers, { 'battery GET /now': null });
    app = harness.app;

    const response = await app.inject({
      method: 'GET',
      url: '/v1/battery/now',
      headers: harness.headers,
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toBeNull();
  });

  it('asks battery for the requested number of days of health trend', async () => {
    const harness = await routeHarness(handlers, {
      'battery GET /health-trend': responseFixtures.batteryHealthTrend,
    });
    app = harness.app;

    const response = await app.inject({
      method: 'GET',
      url: '/v1/battery/health-trend?days=30',
      headers: harness.headers,
    });

    expect(response.json()).toEqual(responseFixtures.batteryHealthTrend);
    expect(harness.calls).toEqual([{ key: 'battery GET /health-trend', query: { days: '30' } }]);
  });

  it('passes the range sessions to battery without their titles', async () => {
    const harness = await routeHarness(handlers, {
      'sessions GET /sessions': { items: [{ ...sessionFixture, title: 'secret title' }] },
      'battery POST /power-by-app': responseFixtures.batteryPowerByApp,
    });
    app = harness.app;

    const response = await app.inject({
      method: 'GET',
      url: `/v1/battery/power-by-app?${rangeQuery}`,
      headers: harness.headers,
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual(responseFixtures.batteryPowerByApp);
    expect(harness.calls).toEqual([
      { key: 'sessions GET /sessions', query: range },
      {
        key: 'battery POST /power-by-app',
        body: {
          from: range.from,
          to: range.to,
          sessions: [
            { appId: sessionFixture.appId, start: sessionFixture.start, end: sessionFixture.end },
          ],
        },
      },
    ]);
  });

  it('does not call battery when the sessions service is down', async () => {
    const harness = await routeHarness(handlers, {
      'sessions GET /sessions': new ServiceUnavailableError('sessions', 'timeout'),
    });
    app = harness.app;

    const response = await app.inject({
      method: 'GET',
      url: `/v1/battery/power-by-app?${rangeQuery}`,
      headers: harness.headers,
    });

    expect(response.statusCode).toBe(STATUS.UNAVAILABLE);
    expect(harness.calls).toHaveLength(1);
  });
});
