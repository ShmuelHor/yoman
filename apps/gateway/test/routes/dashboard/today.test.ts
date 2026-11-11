import {
  batteryNowFixture,
  dayReportFixture,
  FIXTURE_NOW,
  focusActiveFixture,
  incidentFixture,
} from '@yoman/shared/fixtures/data';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { ServiceUnavailableError } from '../../../src/core/errors.js';
import { createDashboardToday, openIncidentsRange } from '../../../src/routes/dashboard/today.js';
import { STATUS } from '../../harness.js';
import { type CallKey, type RecordedCall, routeHarness } from '../route-harness.js';

const NOW = Date.parse(FIXTURE_NOW);
const openIncident = { ...incidentFixture, end: null };

const ALL_UP: Partial<Record<CallKey, unknown>> = {
  'reports GET /today': dayReportFixture,
  'battery GET /now': batteryNowFixture,
  'system GET /incidents': { items: [] },
  'focus GET /state': focusActiveFixture,
};

describe('openIncidentsRange', () => {
  it('starts now and reaches a minute ahead', () => {
    expect(openIncidentsRange(NOW)).toEqual({
      from: '2026-11-08T10:00:00.000Z',
      to: '2026-11-08T10:01:00.000Z',
    });
  });
});

describe('GET /v1/dashboard/today', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function today(
    replies: Partial<Record<CallKey, unknown>>,
  ): Promise<{ response: LightMyRequestResponse; calls: RecordedCall[] }> {
    const harness = await routeHarness(
      { dashboardToday: createDashboardToday({ now: () => NOW }) },
      replies,
    );
    app = harness.app;
    const response = await app.inject({
      method: 'GET',
      url: '/v1/dashboard/today',
      headers: harness.headers,
    });
    return { response, calls: harness.calls };
  }

  it('combines reports, battery, open incidents and focus into one response', async () => {
    const { response } = await today({
      ...ALL_UP,
      'system GET /incidents': { items: [openIncident] },
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual({
      data: {
        reports: dayReportFixture,
        battery: batteryNowFixture,
        openIncidents: { items: [openIncident] },
        focus: focusActiveFixture,
      },
      degraded: [],
    });
  });

  it('asks the system service for the incidents that reach the present', async () => {
    const { calls } = await today(ALL_UP);

    expect(calls).toContainEqual({
      key: 'system GET /incidents',
      query: openIncidentsRange(NOW),
    });
  });

  it('leaves out incidents that already ended', async () => {
    const { response } = await today({
      ...ALL_UP,
      'system GET /incidents': { items: [incidentFixture, openIncident] },
    });

    expect(response.json()).toMatchObject({ data: { openIncidents: { items: [openIncident] } } });
  });

  it('answers without a service that is down and names it in degraded', async () => {
    const { response } = await today({
      ...ALL_UP,
      'battery GET /now': new ServiceUnavailableError('battery', 'timeout'),
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual({
      data: {
        reports: dayReportFixture,
        battery: null,
        openIncidents: { items: [] },
        focus: focusActiveFixture,
      },
      degraded: ['battery'],
    });
  });

  it('still answers 200, with every section null, when every service is down', async () => {
    const { response } = await today({
      'reports GET /today': new ServiceUnavailableError('reports', 'unreachable'),
      'battery GET /now': new ServiceUnavailableError('battery', 'timeout'),
      'system GET /incidents': new ServiceUnavailableError('system', 'status'),
      'focus GET /state': new ServiceUnavailableError('focus', 'invalid-response'),
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual({
      data: { reports: null, battery: null, openIncidents: null, focus: null },
      degraded: ['battery', 'focus', 'reports', 'system'],
    });
  });

  it('reports a device without a battery as null, not as degraded', async () => {
    const { response } = await today({ ...ALL_UP, 'battery GET /now': null });

    expect(response.json()).toMatchObject({ data: { battery: null }, degraded: [] });
  });

  it('fails with a 500, not a partial answer, on an error that is not an outage', async () => {
    const { response } = await today({
      ...ALL_UP,
      'focus GET /state': new Error('a bug in the gateway'),
    });

    expect(response.statusCode).toBe(STATUS.INTERNAL);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL', message: 'Internal error', requestId: expect.any(String) },
    });
  });
});
