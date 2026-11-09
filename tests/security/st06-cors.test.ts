import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  contractRoutes,
  credentialsFor,
  FOREIGN_ORIGIN,
  GATEWAY_HOST,
  NO_RATE_LIMIT,
  securityGateway,
  validRequest,
  WEB_ORIGIN,
} from './lib/gateway.js';

const FOREIGN_ORIGINS = [
  FOREIGN_ORIGIN,
  'null',
  'http://127.0.0.1:4711',
  'https://127.0.0.1:4710',
  'http://localhost:4710.evil.example',
];

describe('ST06 CORS', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await securityGateway({ rateLimits: NO_RATE_LIMIT });
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(FOREIGN_ORIGINS)(
    'a foreign origin gets no Access-Control-Allow-Origin header: %s',
    async (origin) => {
      for (const route of contractRoutes) {
        const headers = { ...(await credentialsFor(app, route.contract)), origin };
        const preflight = await app.inject({
          method: 'OPTIONS',
          url: route.contract.path,
          headers: {
            host: GATEWAY_HOST,
            origin,
            'access-control-request-method': route.contract.method,
            'access-control-request-headers': 'content-type,x-csrf-token',
          },
        });
        const request = await app.inject(validRequest(route, headers));

        for (const response of [preflight, request]) {
          expect(response.headers['access-control-allow-origin'], route.name).toBeUndefined();
          expect(response.headers['access-control-allow-credentials'], route.name).toBeUndefined();
        }
      }
    },
  );

  it('the web origin, and only it, is allowed with credentials', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/settings',
      headers: { host: GATEWAY_HOST, origin: WEB_ORIGIN, 'access-control-request-method': 'PUT' },
    });

    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers.vary).toContain('Origin');
  });
});
