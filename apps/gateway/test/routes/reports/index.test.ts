import { responseFixtures } from '@yoman/shared/fixtures/responses';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { ServiceUnavailableError } from '../../../src/core/errors.js';
import { handlers } from '../../../src/routes/reports/index.js';
import { STATUS } from '../../harness.js';
import { routeHarness } from '../route-harness.js';

const START = '2026-11-02';

describe('GET /v1/week', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('returns the week the reports service builds from the requested start', async () => {
    const harness = await routeHarness(handlers, { 'reports GET /week': responseFixtures.week });
    app = harness.app;

    const response = await app.inject({
      method: 'GET',
      url: `/v1/week?start=${START}`,
      headers: harness.headers,
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual(responseFixtures.week);
    expect(harness.calls).toEqual([{ key: 'reports GET /week', query: { start: START } }]);
  });

  it('answers 503 when the reports service is down', async () => {
    const harness = await routeHarness(handlers, {
      'reports GET /week': new ServiceUnavailableError('reports', 'timeout'),
    });
    app = harness.app;

    const response = await app.inject({
      method: 'GET',
      url: `/v1/week?start=${START}`,
      headers: harness.headers,
    });

    expect(response.statusCode).toBe(STATUS.UNAVAILABLE);
    expect(response.json()).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service unavailable',
        requestId: expect.any(String),
      },
    });
  });
});
