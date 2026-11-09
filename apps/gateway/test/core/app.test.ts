import { FIXTURE_IDS } from '@yoman/shared/fixtures/data';
import { requestFixtures } from '@yoman/shared/fixtures/requests';
import { responseFixtures } from '@yoman/shared/fixtures/responses';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BODY_LIMIT_BYTES } from '../../src/core/app.js';
import { INGEST_RATE_LIMIT } from '../../src/core/contract-routes.js';
import { ServiceUnavailableError } from '../../src/core/errors.js';
import { defineHandlers, toHandlerMap } from '../../src/core/route-handler.js';
import { createSessionStore, SESSION_TTL_MS } from '../../src/core/web-sessions.js';
import { agentHeaders, testGateway, webSession } from '../gateway-harness.js';
import { GATEWAY_HOST, STATUS, WEB_ORIGIN } from '../harness.js';

const START = Date.parse('2026-11-08T10:00:00Z');
const MS_PER_SECOND = 1_000;
const JSON_HEADERS = { 'content-type': 'application/json' };

describe('buildGateway', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('answers the health check without a credential', async () => {
    app = await testGateway();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { host: GATEWAY_HOST },
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('answers 421 to a foreign Host before anything else', async () => {
    app = await testGateway();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'evil.example' },
    });

    expect(response.statusCode).toBe(STATUS.MISDIRECTED);
  });

  it('answers 403 to a foreign Origin, even with the agent token', async () => {
    app = await testGateway();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/focus/state',
      headers: { ...agentHeaders, origin: 'http://evil.example' },
    });

    expect(response.statusCode).toBe(STATUS.FORBIDDEN);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers 404 with the error body for an unknown path', async () => {
    app = await testGateway();

    const response = await app.inject({ method: 'GET', url: '/v1/nope', headers: agentHeaders });

    expect(response.statusCode).toBe(STATUS.NOT_FOUND);
    expect(response.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  it('does not answer HEAD on GET routes', async () => {
    app = await testGateway();

    const response = await app.inject({
      method: 'HEAD',
      url: '/v1/focus/state',
      headers: agentHeaders,
    });

    expect(response.statusCode).toBe(STATUS.NOT_FOUND);
  });

  it('answers 501 for a contract route without a handler', async () => {
    app = await testGateway();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/focus/state',
      headers: agentHeaders,
    });

    expect(response.statusCode).toBe(STATUS.NOT_IMPLEMENTED);
    expect(response.json()).toEqual({
      error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented' },
    });
  });

  describe('GET /v1/session', () => {
    it('sets an HttpOnly, SameSite=Strict session cookie and returns the CSRF token', async () => {
      const sessions = createSessionStore({ now: () => START });
      app = await testGateway({ sessions });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/session',
        headers: { host: GATEWAY_HOST, origin: WEB_ORIGIN },
      });

      expect(response.statusCode).toBe(STATUS.OK);
      const body = response.json<{ csrfToken: string; expiresAt: string }>();
      expect(body.expiresAt).toBe(new Date(START + SESSION_TTL_MS).toISOString());
      expect(response.cookies).toEqual([
        expect.objectContaining({
          name: 'yoman_session',
          httpOnly: true,
          sameSite: 'Strict',
          path: '/v1',
          maxAge: SESSION_TTL_MS / MS_PER_SECOND,
        }),
      ]);
      const cookie = response.cookies[0]?.value;
      expect(sessions.find(cookie)?.csrfToken).toBe(body.csrfToken);
    });

    it('lets the web origin read the reply with credentials', async () => {
      app = await testGateway();

      const response = await app.inject({
        method: 'GET',
        url: '/v1/session',
        headers: { host: GATEWAY_HOST, origin: WEB_ORIGIN },
      });

      expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('handlers', () => {
    it('passes parsed request parts and the principal to the handler and returns its result', async () => {
      const week = vi.fn().mockResolvedValue(responseFixtures.week);
      app = await testGateway({ handlers: toHandlerMap(defineHandlers({ week })) });
      const web = await webSession(app);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/week?start=2026-11-02',
        headers: web.headers,
      });

      expect(response.statusCode).toBe(STATUS.OK);
      expect(response.json()).toEqual(responseFixtures.week);
      expect(week).toHaveBeenCalledWith(
        expect.objectContaining({
          params: {},
          query: { start: '2026-11-02' },
          body: undefined,
          principal: expect.objectContaining({ kind: 'session' }),
        }),
      );
    });

    it('coerces query values as the contract says', async () => {
      const batteryHealthTrend = vi.fn().mockResolvedValue(responseFixtures.batteryHealthTrend);
      app = await testGateway({ handlers: toHandlerMap(defineHandlers({ batteryHealthTrend })) });
      const web = await webSession(app);

      await app.inject({
        method: 'GET',
        url: '/v1/battery/health-trend?days=30',
        headers: web.headers,
      });

      expect(batteryHealthTrend).toHaveBeenCalledWith(
        expect.objectContaining({ query: { days: 30 } }),
      );
    });

    it('answers with the contract status and the parsed body', async () => {
      const createRule = vi.fn().mockResolvedValue(responseFixtures.createRule);
      app = await testGateway({ handlers: toHandlerMap(defineHandlers({ createRule })) });
      const web = await webSession(app);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/rules',
        headers: { ...web.headers, ...JSON_HEADERS },
        payload: JSON.stringify(requestFixtures.createRule.body),
      });

      expect(response.statusCode).toBe(STATUS.CREATED);
      expect(createRule).toHaveBeenCalledWith(
        expect.objectContaining({ body: requestFixtures.createRule.body }),
      );
    });

    it('answers 204 with no body for a route without a response', async () => {
      const deleteRule = vi.fn().mockResolvedValue(undefined);
      app = await testGateway({ handlers: toHandlerMap(defineHandlers({ deleteRule })) });
      const web = await webSession(app);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/rules/${FIXTURE_IDS.rule}`,
        headers: web.headers,
      });

      expect(response.statusCode).toBe(STATUS.NO_CONTENT);
      expect(response.body).toBe('');
    });

    it('answers 500 without details when a handler breaks its response contract', async () => {
      const focusState = vi.fn().mockResolvedValue({ secret: 'leaked internals' });
      app = await testGateway({ handlers: toHandlerMap(defineHandlers({ focusState })) });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/focus/state',
        headers: agentHeaders,
      });

      expect(response.statusCode).toBe(STATUS.INTERNAL);
      expect(response.body).not.toContain('leaked internals');
      expect(response.json()).toEqual({ error: { code: 'INTERNAL', message: 'Internal error' } });
    });

    it('answers 503 when a handler hits an unavailable service', async () => {
      const focusState = vi.fn().mockRejectedValue(new ServiceUnavailableError('focus', 'timeout'));
      app = await testGateway({ handlers: toHandlerMap(defineHandlers({ focusState })) });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/focus/state',
        headers: agentHeaders,
      });

      expect(response.statusCode).toBe(STATUS.UNAVAILABLE);
      expect(response.json()).toEqual({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Service unavailable' },
      });
    });

    it('answers 500 without the message when a handler throws a plain error', async () => {
      const focusState = vi.fn().mockRejectedValue(new Error('password=hunter2'));
      app = await testGateway({ handlers: toHandlerMap(defineHandlers({ focusState })) });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/focus/state',
        headers: agentHeaders,
      });

      expect(response.statusCode).toBe(STATUS.INTERNAL);
      expect(response.body).not.toContain('hunter2');
    });

    it('never calls the handler for an invalid request', async () => {
      const week = vi.fn();
      app = await testGateway({ handlers: toHandlerMap(defineHandlers({ week })) });
      const web = await webSession(app);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/week?start=monday',
        headers: web.headers,
      });

      expect(response.statusCode).toBe(STATUS.BAD_REQUEST);
      expect(response.json()).toEqual({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          issues: [{ path: 'query.start', message: expect.any(String) }],
        },
      });
      expect(week).not.toHaveBeenCalled();
    });

    it('rejects unknown query keys and a body on a route that takes none', async () => {
      app = await testGateway();

      const query = await app.inject({
        method: 'GET',
        url: '/v1/focus/state?debug=1',
        headers: agentHeaders,
      });
      const body = await app.inject({
        method: 'POST',
        url: '/v1/focus/stop',
        headers: agentHeaders,
        payload: { force: true },
      });

      expect(query.statusCode).toBe(STATUS.BAD_REQUEST);
      expect(body.statusCode).toBe(STATUS.BAD_REQUEST);
    });

    it('answers 400 without echoing malformed JSON', async () => {
      app = await testGateway();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/ingest',
        headers: { ...agentHeaders, 'content-type': 'application/json' },
        payload: '{"agentVersion": "<script>',
      });

      expect(response.statusCode).toBe(STATUS.BAD_REQUEST);
      expect(response.body).not.toContain('<script>');
    });
  });

  it('accepts a body up to the limit and rejects one byte more with 413', async () => {
    app = await testGateway();
    const padding = (size: number): string => {
      const shell = '{"pad":""}';
      return `{"pad":"${'a'.repeat(size - shell.length)}"}`;
    };

    const atLimit = await app.inject({
      method: 'POST',
      url: '/v1/ingest',
      headers: { ...agentHeaders, 'content-type': 'application/json' },
      payload: padding(BODY_LIMIT_BYTES),
    });
    const overLimit = await app.inject({
      method: 'POST',
      url: '/v1/focus/known-apps',
      headers: { ...agentHeaders, 'content-type': 'application/json' },
      payload: padding(BODY_LIMIT_BYTES + 1),
    });

    expect(atLimit.statusCode).toBe(STATUS.BAD_REQUEST);
    expect(overLimit.statusCode).toBe(STATUS.PAYLOAD_TOO_LARGE);
    expect(overLimit.json()).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' },
    });
  });

  it('limits ingest to one batch per 10 s', async () => {
    vi.useFakeTimers({ now: START, toFake: ['Date'] });
    try {
      const gateway = await testGateway();
      app = gateway;
      const send = (): Promise<LightMyRequestResponse> =>
        gateway.inject({
          method: 'POST',
          url: '/v1/ingest',
          headers: { ...agentHeaders, ...JSON_HEADERS },
          payload: JSON.stringify(requestFixtures.ingest.body),
        });

      const first = await send();
      const second = await send();
      vi.setSystemTime(START + INGEST_RATE_LIMIT.timeWindow);
      const third = await send();

      expect(first.statusCode).toBe(STATUS.NOT_IMPLEMENTED);
      expect(second.statusCode).toBe(STATUS.TOO_MANY_REQUESTS);
      expect(second.json()).toEqual({
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      });
      expect(second.headers['retry-after']).toBeDefined();
      expect(third.statusCode).toBe(STATUS.NOT_IMPLEMENTED);
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers a CORS preflight from the web origin', async () => {
    app = await testGateway();

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/rules',
      headers: {
        host: GATEWAY_HOST,
        origin: WEB_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-csrf-token',
      },
    });

    expect(response.statusCode).toBe(STATUS.NO_CONTENT);
    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-headers']).toBe('content-type, x-csrf-token');
    expect(response.headers['access-control-allow-methods']).toBe('GET, POST, PUT, DELETE');
  });
});
