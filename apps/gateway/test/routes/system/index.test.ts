import { requestFixtures } from '@yoman/shared/fixtures/requests';
import { responseFixtures } from '@yoman/shared/fixtures/responses';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { ServiceUnavailableError } from '../../../src/core/errors.js';
import { handlers } from '../../../src/routes/system/index.js';
import { STATUS } from '../../harness.js';
import { routeHarness } from '../route-harness.js';

const range = requestFixtures.systemIncidents.query ?? {};
const date = requestFixtures.systemTimeline.query?.date ?? '';

describe('system routes', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('returns the incidents of the requested range', async () => {
    const harness = await routeHarness(handlers, {
      'system GET /incidents': responseFixtures.systemIncidents,
    });
    app = harness.app;

    const response = await app.inject({
      method: 'GET',
      url: `/v1/system/incidents?${new URLSearchParams(range).toString()}`,
      headers: harness.headers,
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual(responseFixtures.systemIncidents);
    expect(harness.calls).toEqual([{ key: 'system GET /incidents', query: range }]);
  });

  it('returns the recurring culprits of the requested days', async () => {
    const harness = await routeHarness(handlers, {
      'system GET /culprits': responseFixtures.systemCulprits,
    });
    app = harness.app;

    const response = await app.inject({
      method: 'GET',
      url: '/v1/system/culprits?days=7',
      headers: harness.headers,
    });

    expect(response.json()).toEqual(responseFixtures.systemCulprits);
    expect(harness.calls).toEqual([{ key: 'system GET /culprits', query: { days: '7' } }]);
  });

  it('returns the pressure timeline of the requested date', async () => {
    const harness = await routeHarness(handlers, {
      'system GET /timeline': responseFixtures.systemTimeline,
    });
    app = harness.app;

    const response = await app.inject({
      method: 'GET',
      url: `/v1/system/timeline?date=${date}`,
      headers: harness.headers,
    });

    expect(response.json()).toEqual(responseFixtures.systemTimeline);
    expect(harness.calls).toEqual([{ key: 'system GET /timeline', query: { date } }]);
  });

  it('answers 503 when the system service is down', async () => {
    const harness = await routeHarness(handlers, {
      'system GET /timeline': new ServiceUnavailableError('system', 'timeout'),
    });
    app = harness.app;

    const response = await app.inject({
      method: 'GET',
      url: `/v1/system/timeline?date=${date}`,
      headers: harness.headers,
    });

    expect(response.statusCode).toBe(STATUS.UNAVAILABLE);
  });
});
