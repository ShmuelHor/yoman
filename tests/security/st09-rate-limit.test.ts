import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GLOBAL_RATE_LIMIT } from '../../apps/gateway/src/core/app.js';
import { INGEST_RATE_LIMIT } from '../../apps/gateway/src/core/contract-routes.js';
import {
  agentHeaders,
  contractRoutes,
  GATEWAY_HOST,
  STATUS,
  securityGateway,
  validRequest,
  webHeaders,
} from './lib/gateway.js';

const START = Date.parse('2026-11-08T10:00:00Z');

function route(name: string): (typeof contractRoutes)[number] {
  const found = contractRoutes.find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`the route map has no ${name} route`);
  }
  return found;
}

describe('ST09 rate limit', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    vi.useRealTimers();
    await app?.close();
    app = undefined;
  });

  it('exceeding the rate limit returns 429', async () => {
    vi.useFakeTimers({ now: START, toFake: ['Date'] });
    const gateway = await securityGateway();
    app = gateway;
    // SECURITY A17: 300 requests per minute, shared by every route but ingest.
    const reads = [route('focusState'), route('getSettings'), route('listApps')];
    const web = await webHeaders(gateway);
    const send = (index: number): Promise<{ statusCode: number }> => {
      const target = reads[index % reads.length] ?? route('focusState');
      return gateway.inject(
        validRequest(target, target.contract.auth === 'session' ? web : agentHeaders),
      );
    };

    // The session request above already counted against the window.
    for (let sent = 1; sent < GLOBAL_RATE_LIMIT.max; sent += 1) {
      expect((await send(sent)).statusCode).not.toBe(STATUS.TOO_MANY_REQUESTS);
    }
    const limited = await gateway.inject(validRequest(route('focusState'), agentHeaders));

    expect(limited.statusCode).toBe(STATUS.TOO_MANY_REQUESTS);
    expect(limited.json()).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests', requestId: expect.any(String) },
    });
    expect(limited.headers['retry-after']).toBeDefined();

    vi.setSystemTime(START + GLOBAL_RATE_LIMIT.timeWindow);
    expect((await send(0)).statusCode).not.toBe(STATUS.TOO_MANY_REQUESTS);
  });

  it('unauthenticated ingest requests do not use up the agent quota', async () => {
    vi.useFakeTimers({ now: START, toFake: ['Date'] });
    const gateway = await securityGateway();
    app = gateway;
    const ingest = route('ingest');
    const anonymous = validRequest(ingest, { host: GATEWAY_HOST });
    const wrongToken = validRequest(ingest, {
      host: GATEWAY_HOST,
      authorization: 'Bearer wrong-token',
    });

    const rejected = [await gateway.inject(anonymous), await gateway.inject(wrongToken)];
    const agent = await gateway.inject(validRequest(ingest, agentHeaders));

    expect(rejected.map((response) => response.statusCode)).toEqual([
      STATUS.UNAUTHORIZED,
      STATUS.UNAUTHORIZED,
    ]);
    expect(agent.statusCode).not.toBe(STATUS.TOO_MANY_REQUESTS);
    expect(agent.statusCode).not.toBe(STATUS.UNAUTHORIZED);
  });

  it('ingest accepts one batch per 10 s and answers 429 to the next', async () => {
    vi.useFakeTimers({ now: START, toFake: ['Date'] });
    const gateway = await securityGateway();
    app = gateway;
    const ingest = validRequest(route('ingest'), agentHeaders);

    const first = await gateway.inject(ingest);
    const second = await gateway.inject(ingest);
    vi.setSystemTime(START + INGEST_RATE_LIMIT.timeWindow);
    const third = await gateway.inject(ingest);

    expect(first.statusCode).not.toBe(STATUS.TOO_MANY_REQUESTS);
    expect(second.statusCode).toBe(STATUS.TOO_MANY_REQUESTS);
    expect(third.statusCode).not.toBe(STATUS.TOO_MANY_REQUESTS);
  });
});
