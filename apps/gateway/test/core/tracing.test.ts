import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defineHandlers, toHandlerMap } from '../../src/core/route-handler.js';
import type { ServiceClient } from '../../src/core/service-client.js';
import { agentHeaders, testGateway } from '../gateway-harness.js';
import { STATUS } from '../harness.js';
import { recordingLogger } from '../log-capture.js';

const REQUEST_ID = 'req-7f3a';
const LEVEL_WARN = 40;
const LEVEL_ERROR = 50;

describe('request tracing', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('echoes the caller request id and logs an arrow line in and out with it', async () => {
    const { logger, lines } = recordingLogger();
    const focusState = vi.fn().mockResolvedValue({ active: false });
    app = await testGateway({ logger, handlers: toHandlerMap(defineHandlers({ focusState })) });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/focus/state',
      headers: { ...agentHeaders, 'x-request-id': REQUEST_ID },
    });

    expect(response.headers['x-request-id']).toBe(REQUEST_ID);
    const messages = lines.filter((line) => line.reqId === REQUEST_ID).map((line) => line.msg);
    expect(messages).toContain('→ GET /v1/focus/state');
    expect(messages).toContainEqual(
      expect.stringMatching(/^← GET \/v1\/focus\/state \d{3} \d+ms$/),
    );
  });

  it('generates a request id when the caller sends none or a malformed one', async () => {
    app = await testGateway();

    const none = await app.inject({ method: 'GET', url: '/v1/focus/state', headers: agentHeaders });
    const bad = await app.inject({
      method: 'GET',
      url: '/v1/focus/state',
      headers: { ...agentHeaders, 'x-request-id': 'two words' },
    });

    expect(none.headers['x-request-id']).toMatch(/^req-[0-9a-f]{12}$/);
    expect(bad.headers['x-request-id']).toMatch(/^req-[0-9a-f]{12}$/);
  });

  it('forwards the request id to every service call a handler makes', async () => {
    const call = vi.fn().mockResolvedValue({ active: false });
    const services: ServiceClient = { call };
    const focusState = vi.fn(({ services: scoped }) =>
      scoped.call('focus', {
        method: 'GET',
        path: '/state',
        response: { parse: (v: unknown) => v },
      }),
    );
    app = await testGateway({
      services,
      handlers: toHandlerMap(defineHandlers({ focusState })),
    });

    await app.inject({
      method: 'GET',
      url: '/v1/focus/state',
      headers: { ...agentHeaders, 'x-request-id': REQUEST_ID },
    });

    expect(call).toHaveBeenCalledWith('focus', expect.objectContaining({ requestId: REQUEST_ID }));
  });

  it('puts the request id in the error body and logs a 500 once with its stack', async () => {
    const { logger, lines } = recordingLogger();
    const focusState = vi.fn().mockRejectedValue(new Error('boom'));
    app = await testGateway({ logger, handlers: toHandlerMap(defineHandlers({ focusState })) });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/focus/state',
      headers: { ...agentHeaders, 'x-request-id': REQUEST_ID },
    });

    expect(response.statusCode).toBe(STATUS.INTERNAL);
    expect(response.json()).toMatchObject({ error: { requestId: REQUEST_ID } });
    expect(response.body).not.toContain('boom');
    const failures = lines.filter((line) => line.msg === 'Request failed');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ reqId: REQUEST_ID, level: LEVEL_ERROR });
  });

  it('logs a rejected request as a warning without its query string', async () => {
    const { logger, lines } = recordingLogger();
    app = await testGateway({ logger });

    await app.inject({ method: 'GET', url: '/v1/week?title=secret-title', headers: agentHeaders });

    const done = lines.find((line) => String(line.msg).startsWith('← GET /v1/week'));
    expect(done).toMatchObject({ level: LEVEL_WARN });
    expect(JSON.stringify(lines)).not.toContain('secret-title');
  });
});
