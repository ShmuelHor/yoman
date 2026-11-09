import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  agentHeaders,
  contractRoutes,
  credentialsFor,
  FOREIGN_ORIGIN,
  NO_RATE_LIMIT,
  STATE_CHANGING,
  STATUS,
  securityGateway,
  validRequest,
  webHeaders,
} from './lib/gateway.js';

/** Every write the web may make: these are what a CSRF attack would aim at (SECURITY A3). */
const webWrites = contractRoutes.filter(
  ({ contract }) => STATE_CHANGING.has(contract.method) && contract.auth !== 'agent',
);

function without(headers: Record<string, string>, name: string): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([key]) => key !== name));
}

describe('ST05 CSRF and Origin', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await securityGateway({ rateLimits: NO_RATE_LIMIT });
  });

  afterAll(async () => {
    await app.close();
  });

  it('covers the web writes', () => {
    expect(webWrites.length).toBeGreaterThan(0);
  });

  it.each(webWrites)(
    'a state-changing request without a CSRF token or with a foreign Origin returns 403: $name',
    async (route) => {
      const web = await webHeaders(app);
      const other = await webHeaders(app);
      const attempts = {
        'no CSRF token': without(web, 'x-csrf-token'),
        'another session CSRF token': { ...web, 'x-csrf-token': other['x-csrf-token'] ?? '' },
        'an empty CSRF token': { ...web, 'x-csrf-token': '' },
        'a foreign Origin': { ...web, origin: FOREIGN_ORIGIN },
        'the opaque Origin null': { ...web, origin: 'null' },
        'no Origin': without(web, 'origin'),
      };

      for (const [attempt, headers] of Object.entries(attempts)) {
        const response = await app.inject(validRequest(route, headers));

        expect(response.statusCode, attempt).toBe(STATUS.FORBIDDEN);
        expect(response.json(), attempt).toEqual({
          error: { code: 'FORBIDDEN', message: 'Forbidden' },
        });
      }
    },
  );

  it.each(webWrites)(
    'the same write with the CSRF token from the web origin passes: $name',
    async (route) => {
      const response = await app.inject(validRequest(route, await webHeaders(app)));

      expect(response.statusCode).not.toBe(STATUS.FORBIDDEN);
    },
  );

  it.each(contractRoutes)('any request with a foreign Origin returns 403: $name', async (route) => {
    const headers = { ...(await credentialsFor(app, route.contract)), origin: FOREIGN_ORIGIN };

    const response = await app.inject(validRequest(route, headers));

    expect(response.statusCode).toBe(STATUS.FORBIDDEN);
  });

  it('the agent writes without a CSRF token, since a browser cannot send its Bearer token', async () => {
    const ingest = contractRoutes.find(({ name }) => name === 'ingest');
    if (ingest === undefined) {
      throw new Error('the route map has no ingest route');
    }

    const response = await app.inject(validRequest(ingest, agentHeaders));

    expect(response.statusCode).not.toBe(STATUS.FORBIDDEN);
  });
});
