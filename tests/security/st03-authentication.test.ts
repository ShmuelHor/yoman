import { randomBytes } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  agentHeaders,
  contractRoutes,
  credentialsFor,
  GATEWAY_HOST,
  NO_RATE_LIMIT,
  STATUS,
  securityGateway,
  TOKEN_BYTES,
  validRequest,
  webHeaders,
} from './lib/gateway.js';

/** Same shape as a real token, so only its value is wrong. */
const WRONG_TOKEN = randomBytes(TOKEN_BYTES).toString('base64url');

describe('ST03 authentication', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await securityGateway({ rateLimits: NO_RATE_LIMIT });
  });

  afterAll(async () => {
    await app.close();
  });

  it('covers every route in the contracts route map', () => {
    expect(contractRoutes.length).toBeGreaterThan(0);
  });

  it.each(contractRoutes)(
    'every route in the contracts route map returns 401 without a token or session: $name',
    async (route) => {
      const response = await app.inject(validRequest(route, { host: GATEWAY_HOST }));

      expect(response.statusCode).toBe(STATUS.UNAUTHORIZED);
      expect(response.json()).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: expect.any(String) },
      });
    },
  );

  const credentialed = contractRoutes.filter(({ contract }) => contract.auth !== 'origin');

  it.each(credentialed)('a wrong agent token returns 401: $name', async (route) => {
    const response = await app.inject(
      validRequest(route, { host: GATEWAY_HOST, authorization: `Bearer ${WRONG_TOKEN}` }),
    );

    expect(response.statusCode).toBe(STATUS.UNAUTHORIZED);
  });

  it.each(credentialed)('a forged session cookie returns 401: $name', async (route) => {
    const forged = { ...(await webHeaders(app)), cookie: 'yoman_session=forged' };

    const response = await app.inject(validRequest(route, forged));

    expect(response.statusCode).toBe(STATUS.UNAUTHORIZED);
  });

  it.each(contractRoutes.filter(({ contract }) => contract.auth === 'session'))(
    'the agent token does not open a web-only route: $name',
    async (route) => {
      const response = await app.inject(validRequest(route, agentHeaders));

      expect(response.statusCode).toBe(STATUS.FORBIDDEN);
    },
  );

  it.each(contractRoutes.filter(({ contract }) => contract.auth === 'agent'))(
    'a web session does not open an agent-only route: $name',
    async (route) => {
      const response = await app.inject(validRequest(route, await webHeaders(app)));

      expect(response.statusCode).toBe(STATUS.FORBIDDEN);
    },
  );

  it.each(contractRoutes)('the right credential gets past authentication: $name', async (route) => {
    const response = await app.inject(
      validRequest(route, await credentialsFor(app, route.contract)),
    );

    expect([STATUS.UNAUTHORIZED, STATUS.FORBIDDEN]).not.toContain(response.statusCode);
  });
});
