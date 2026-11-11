import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  agentHeaders,
  contractRoutes,
  credentialsFor,
  NO_RATE_LIMIT,
  STATUS,
  securityGateway,
  validRequest,
} from './lib/gateway.js';

/** What a DNS rebinding page, or a client aimed at the wrong port, sends (SECURITY A4). */
const FOREIGN_HOSTS = [
  'evil.example',
  'evil.example:4711',
  'localhost:4711.evil.example',
  '127.0.0.1',
  'localhost',
  '127.0.0.1:4710',
  '127.0.0.1:8080',
  '0.0.0.0:4711',
  '[::1]:4711',
  '',
];

describe('ST04 host allowlist', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await securityGateway({ rateLimits: NO_RATE_LIMIT });
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(FOREIGN_HOSTS)('a request with a foreign Host header returns 421: %j', async (host) => {
    for (const route of contractRoutes) {
      const headers = { ...(await credentialsFor(app, route.contract)), host };

      const response = await app.inject(validRequest(route, headers));

      expect(response.statusCode, route.name).toBe(STATUS.MISDIRECTED);
      expect(response.json()).toEqual({
        error: {
          code: 'MISDIRECTED_REQUEST',
          message: 'Misdirected request',
          requestId: expect.any(String),
        },
      });
    }
  });

  it.each(['/health', '/v1/not-a-route', '/'])(
    'a foreign Host is refused on %s too',
    async (url) => {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { ...agentHeaders, host: 'evil.example' },
      });

      expect(response.statusCode).toBe(STATUS.MISDIRECTED);
    },
  );

  it('refuses a foreign Host before answering a CORS preflight', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/rules',
      headers: {
        host: 'evil.example:4711',
        origin: 'http://127.0.0.1:4710',
        'access-control-request-method': 'POST',
      },
    });

    expect(response.statusCode).toBe(STATUS.MISDIRECTED);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it.each(['127.0.0.1:4711', 'localhost:4711'])('the gateway answers for %s', async (host) => {
    const response = await app.inject({ method: 'GET', url: '/health', headers: { host } });

    expect(response.statusCode).toBe(STATUS.OK);
  });
});
