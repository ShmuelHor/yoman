import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { CLIENT_ERRORS_PATH, CLIENT_ERRORS_RATE_LIMIT } from '../../src/core/client-errors.js';
import { testGateway, webSession } from '../gateway-harness.js';
import { GATEWAY_HOST, STATUS } from '../harness.js';
import { recordingLogger } from '../log-capture.js';

const REPORT = { kind: 'request-failed', reqId: 'req-c2d8', route: '/v1/apps', status: 500 };
const OVERSIZED_BYTES = 4_096;

describe(`POST ${CLIENT_ERRORS_PATH}`, () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('logs the report under the failed request id and answers 204', async () => {
    const { logger, lines } = recordingLogger();
    app = await testGateway({ logger });
    const web = await webSession(app);

    const response = await app.inject({
      method: 'POST',
      url: CLIENT_ERRORS_PATH,
      headers: web.headers,
      payload: REPORT,
    });

    expect(response.statusCode).toBe(STATUS.NO_CONTENT);
    expect(lines.find((line) => line.source === 'web')).toMatchObject({
      reqId: 'req-c2d8',
      kind: 'request-failed',
      route: '/v1/apps',
      status: 500,
      msg: 'request failed',
    });
  });

  it('requires a web session', async () => {
    app = await testGateway();

    const response = await app.inject({
      method: 'POST',
      url: CLIENT_ERRORS_PATH,
      headers: { host: GATEWAY_HOST },
      payload: REPORT,
    });

    expect(response.statusCode).toBe(STATUS.UNAUTHORIZED);
  });

  it.each([
    ['an unknown field', { ...REPORT, message: 'Window title: bank' }],
    ['a free-form route', { ...REPORT, route: '/v1/apps?title=secret' }],
    ['a malformed request id', { ...REPORT, reqId: 'two words' }],
    ['an unknown kind', { ...REPORT, kind: 'other' }],
    ['a status out of range', { ...REPORT, status: 99 }],
  ])('rejects %s', async (_name, payload) => {
    app = await testGateway();
    const web = await webSession(app);

    const response = await app.inject({
      method: 'POST',
      url: CLIENT_ERRORS_PATH,
      headers: web.headers,
      payload,
    });

    expect(response.statusCode).toBe(STATUS.BAD_REQUEST);
  });

  it('rejects a body over the small limit with 413', async () => {
    app = await testGateway();
    const web = await webSession(app);

    const response = await app.inject({
      method: 'POST',
      url: CLIENT_ERRORS_PATH,
      headers: web.headers,
      payload: { ...REPORT, errorName: 'E'.repeat(OVERSIZED_BYTES) },
    });

    expect(response.statusCode).toBe(STATUS.PAYLOAD_TOO_LARGE);
  });

  it('rate limits reports per session', async () => {
    app = await testGateway();
    const web = await webSession(app);
    const gateway = app;
    const send = (): Promise<{ statusCode: number }> =>
      gateway.inject({
        method: 'POST',
        url: CLIENT_ERRORS_PATH,
        headers: web.headers,
        payload: REPORT,
      });

    for (let sent = 0; sent < CLIENT_ERRORS_RATE_LIMIT.max; sent += 1) {
      expect((await send()).statusCode).toBe(STATUS.NO_CONTENT);
    }

    expect((await send()).statusCode).toBe(STATUS.TOO_MANY_REQUESTS);
  });
});
