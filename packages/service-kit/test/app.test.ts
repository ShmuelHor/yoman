import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildApp } from '../src/app.js';
import type { Pingable } from '../src/database.js';
import { ConflictError } from '../src/errors.js';
import { defineRoute, HTTP_NO_CONTENT, type Route } from '../src/route.js';
import { recordingLogger } from './log-capture.js';

const STATUS = {
  OK: 200,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,
  UNAVAILABLE: 503,
} as const;

const up: Pingable = { query: async () => ({ rows: [] }) };
const down: Pingable = { query: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.5')) };

const echo = defineRoute({
  method: 'POST',
  url: '/apps/:id',
  schema: {
    params: z.object({ id: z.coerce.number().int().positive() }),
    query: z.object({ dryRun: z.enum(['true', 'false']).optional() }),
    body: z.object({ name: z.string().min(1), category: z.string() }),
    response: z.object({ id: z.number(), name: z.string() }),
  },
  // The extra field must be stripped by the response schema.
  handler: ({ params, body }) => ({ id: params.id, name: body.name, internal: 'x' }),
});

const routes: Route[] = [
  echo,
  defineRoute({
    method: 'GET',
    url: '/broken',
    schema: { response: z.object({ ok: z.boolean() }) },
    handler: () => ({ ok: 'yes' }) as unknown as { ok: boolean },
  }),
  defineRoute({
    method: 'GET',
    url: '/throws',
    schema: { response: z.unknown() },
    handler: () => {
      throw new Error('relation "sessions.secret_table" does not exist');
    },
  }),
  defineRoute({
    method: 'PUT',
    url: '/conflict',
    schema: { response: z.unknown() },
    handler: () => {
      throw new ConflictError('Rule already exists');
    },
  }),
  defineRoute({
    method: 'DELETE',
    url: '/rules/:id',
    status: HTTP_NO_CONTENT,
    schema: { params: z.object({ id: z.string() }), response: z.undefined() },
    handler: () => undefined,
  }),
];

let app: FastifyInstance | undefined;

function build(db: Pingable = up): FastifyInstance {
  app = buildApp({ logger: pino({ level: 'silent' }), routes, db });
  return app;
}

afterEach(async () => {
  await app?.close();
});

describe('routes', () => {
  it('passes parsed input to the handler and strips unknown response fields', async () => {
    const response = await build().inject({
      method: 'POST',
      url: '/apps/7?dryRun=true',
      payload: { name: 'Firefox', category: 'web' },
    });
    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual({ id: 7, name: 'Firefox' });
  });

  it('rejects invalid input with 400 and the failing field paths', async () => {
    const response = await build().inject({
      method: 'POST',
      url: '/apps/abc',
      payload: { name: '', category: 3 },
    });
    expect(response.statusCode).toBe(STATUS.BAD_REQUEST);
    const body = response.json() as { error: { code: string; issues: { path: string }[] } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.issues.map((issue) => issue.path)).toEqual(['params.id']);
  });

  it('reports body field paths once params are valid', async () => {
    const response = await build().inject({
      method: 'POST',
      url: '/apps/1',
      payload: { name: '', category: 3 },
    });
    const body = response.json() as { error: { issues: { path: string }[] } };
    expect(body.error.issues.map((issue) => issue.path).sort()).toEqual([
      'body.category',
      'body.name',
    ]);
  });

  it('answers malformed JSON with a fixed message', async () => {
    const response = await build().inject({
      method: 'POST',
      url: '/apps/1',
      headers: { 'content-type': 'application/json' },
      payload: '{"name": "secret-fragment',
    });
    expect(response.statusCode).toBe(STATUS.BAD_REQUEST);
    expect(response.json()).toEqual({
      error: { code: 'BAD_REQUEST', message: 'Bad request', requestId: expect.any(String) },
    });
  });

  it('turns a response that breaks its schema into a 500', async () => {
    const response = await build().inject({ method: 'GET', url: '/broken' });
    expect(response.statusCode).toBe(STATUS.INTERNAL);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL', message: 'Internal error', requestId: expect.any(String) },
    });
  });

  it('never shows an unexpected error message to the client', async () => {
    const response = await build().inject({ method: 'GET', url: '/throws' });
    expect(response.statusCode).toBe(STATUS.INTERNAL);
    expect(response.body).not.toContain('secret_table');
  });

  it('maps typed errors to their status and code', async () => {
    const response = await build().inject({ method: 'PUT', url: '/conflict' });
    expect(response.statusCode).toBe(STATUS.CONFLICT);
    expect(response.json()).toEqual({
      error: { code: 'CONFLICT', message: 'Rule already exists', requestId: expect.any(String) },
    });
  });

  it('sends an empty 204', async () => {
    const response = await build().inject({ method: 'DELETE', url: '/rules/3' });
    expect(response.statusCode).toBe(STATUS.NO_CONTENT);
    expect(response.body).toBe('');
  });

  it('answers unknown routes with a typed 404', async () => {
    const response = await build().inject({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(STATUS.NOT_FOUND);
    expect(response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Not found', requestId: expect.any(String) },
    });
  });
});

describe('/health', () => {
  it('is 200 when the database answers', async () => {
    const response = await build(up).inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual({ status: 'ok', checks: { database: 'ok' } });
  });

  it('is 503 without internals when the database is down', async () => {
    const response = await build(down).inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(STATUS.UNAVAILABLE);
    expect(response.json()).toEqual({ status: 'unavailable', checks: { database: 'down' } });
  });
});

describe('request tracing', () => {
  it('echoes a well-formed x-request-id and tags the request line with it', async () => {
    const { logger, lines } = recordingLogger();
    app = buildApp({ logger, routes, db: up });
    const response = await app.inject({
      method: 'POST',
      url: '/apps/7',
      headers: { 'x-request-id': 'req-7f3a' },
      payload: { name: 'Firefox', category: 'web' },
    });
    expect(response.headers['x-request-id']).toBe('req-7f3a');
    const line = lines.find((entry) => entry.route === '/apps/:id');
    expect(line).toMatchObject({
      reqId: 'req-7f3a',
      method: 'POST',
      status: STATUS.OK,
      msg: expect.stringMatching(/^POST \/apps\/:id 200 \d+ms$/),
    });
  });

  it('replaces a malformed x-request-id with a generated one', async () => {
    const response = await build().inject({
      method: 'GET',
      url: '/broken',
      headers: { 'x-request-id': 'bad id\twith "quotes"' },
    });
    expect(response.headers['x-request-id']).toMatch(/^req-[0-9a-f]{12}$/);
  });

  it('puts the request id in the error body and logs the failure once with its stack', async () => {
    const { logger, lines } = recordingLogger();
    app = buildApp({ logger, routes, db: up });
    const response = await app.inject({
      method: 'GET',
      url: '/throws',
      headers: { 'x-request-id': 'req-c2d8' },
    });
    expect(response.json()).toMatchObject({ error: { requestId: 'req-c2d8' } });
    const failures = lines.filter((entry) => entry.msg === 'Request failed');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ reqId: 'req-c2d8', level: 50 });
  });

  it('logs client mistakes as warnings without the rejected URL parameters', async () => {
    const { logger, lines } = recordingLogger();
    app = buildApp({ logger, routes, db: up });
    await app.inject({ method: 'POST', url: '/apps/abc?title=secret', payload: {} });
    const line = lines.find((entry) => entry.status === STATUS.BAD_REQUEST);
    expect(line).toMatchObject({ level: 40, route: '/apps/:id' });
    expect(JSON.stringify(line)).not.toContain('secret');
  });
});
