import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BODY_LIMIT_BYTES } from '../../apps/gateway/src/core/app.js';
import {
  contractRoutes,
  credentialsFor,
  NO_RATE_LIMIT,
  STATUS,
  securityGateway,
  validRequest,
} from './lib/gateway.js';

/** SECURITY A17: 1 MB. */
const ONE_MB = 1_048_576;

/** A JSON body of exactly `size` bytes. */
function bodyOf(size: number): string {
  const shell = '{"pad":""}';
  return `{"pad":"${'a'.repeat(size - shell.length)}"}`;
}

const routesWithBody = contractRoutes.filter(({ contract }) => contract.body !== undefined);

describe('ST10 body limit', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await securityGateway({ rateLimits: NO_RATE_LIMIT });
  });

  afterAll(async () => {
    await app.close();
  });

  it('the limit is 1 MB', () => {
    expect(BODY_LIMIT_BYTES).toBe(ONE_MB);
  });

  it.each(routesWithBody)('a body larger than 1MB returns 413: $name', async (route) => {
    const request = validRequest(route, await credentialsFor(app, route.contract));

    const response = await app.inject({ ...request, payload: bodyOf(ONE_MB + 1) });

    expect(response.statusCode).toBe(STATUS.PAYLOAD_TOO_LARGE);
    expect(response.json()).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' },
    });
  });

  it('a body of exactly 1MB is read, and rejected only by validation', async () => {
    const ingest = routesWithBody.find(({ name }) => name === 'ingest');
    if (ingest === undefined) {
      throw new Error('the route map has no ingest route');
    }
    const request = validRequest(ingest, await credentialsFor(app, ingest.contract));

    const response = await app.inject({ ...request, payload: bodyOf(ONE_MB) });

    expect(response.statusCode).toBe(STATUS.BAD_REQUEST);
  });

  it('a body sent without Content-Length is cut off at the limit too', async () => {
    const ingest = routesWithBody.find(({ name }) => name === 'ingest');
    if (ingest === undefined) {
      throw new Error('the route map has no ingest route');
    }
    const request = validRequest(ingest, await credentialsFor(app, ingest.contract));
    const chunked = { ...request.headers, 'transfer-encoding': 'chunked' };

    const response = await app.inject({
      ...request,
      headers: chunked,
      payload: bodyOf(ONE_MB + 1),
    });

    expect(response.statusCode).toBe(STATUS.PAYLOAD_TOO_LARGE);
  });
});
