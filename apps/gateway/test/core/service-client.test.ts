import type { ServiceName } from '@yoman/shared/common';
import { pino } from 'pino';
import { describe, expect, it, type MockInstance, vi } from 'vitest';
import { z } from 'zod';

import { ConflictError, NotFoundError, ServiceUnavailableError } from '../../src/core/errors.js';
import {
  createServiceClient,
  degradedServices,
  type FetchFunction,
  orDegraded,
  SERVICE_TIMEOUT_MS,
  type ServiceClient,
} from '../../src/core/service-client.js';
import { STATUS } from '../harness.js';

const URLS: Record<ServiceName, URL> = {
  sessions: new URL('http://sessions:8080'),
  reports: new URL('http://reports:8080'),
  goals: new URL('http://goals:8080'),
  battery: new URL('http://battery:8080'),
  system: new URL('http://system:8080'),
  focus: new URL('http://focus:8080'),
};

/** SPEC §5 gateway: 3 s per service. */
const SPEC_TIMEOUT_MS = 3_000;
const ANSWER = 42;

const Total = z.strictObject({ seconds: z.int().min(0) });

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

interface TestClient {
  readonly client: ServiceClient;
  readonly log: { readonly warn: MockInstance };
}

function clientWith(fetch: FetchFunction, timeoutMs?: number): TestClient {
  const log = pino({ level: 'silent' });
  vi.spyOn(log, 'warn');
  const client = createServiceClient({
    urls: URLS,
    log,
    fetch,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  return { client, log: { warn: vi.mocked(log.warn) } };
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected the call to fail');
    },
    (error: unknown) => error,
  );
}

describe('createServiceClient', () => {
  it('calls the service URL with the method, query and JSON body, and parses the reply', async () => {
    const fetch = vi.fn<FetchFunction>().mockResolvedValue(json({ seconds: 60 }));
    const { client } = clientWith(fetch);

    const result = await client.call('reports', {
      method: 'POST',
      path: '/totals',
      query: { from: '2026-11-01', to: '2026-11-08' },
      body: { apps: ['code'] },
      response: Total,
    });

    expect(result).toEqual({ seconds: 60 });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url?.href).toBe('http://reports:8080/totals?from=2026-11-01&to=2026-11-08');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"apps":["code"]}',
      redirect: 'error',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends no body or content type without a body', async () => {
    const fetch = vi.fn<FetchFunction>().mockResolvedValue(json({ seconds: 0 }));
    const { client } = clientWith(fetch);

    await client.call('reports', { method: 'GET', path: '/today', response: Total });

    const init = fetch.mock.calls[0]?.[1];
    expect(init?.headers).toEqual({});
    expect(init).not.toHaveProperty('body');
  });

  it('returns undefined for a 204 reply', async () => {
    const { client } = clientWith(() =>
      Promise.resolve(new Response(null, { status: STATUS.NO_CONTENT })),
    );

    await expect(
      client.call('goals', { method: 'DELETE', path: '/goals/1', response: z.undefined() }),
    ).resolves.toBeUndefined();
  });

  it('defaults to a 3 s timeout', () => {
    expect(SERVICE_TIMEOUT_MS).toBe(SPEC_TIMEOUT_MS);
  });

  it('gives up when the service does not answer in time', async () => {
    const hanging: FetchFunction = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const { client, log } = clientWith(hanging, 1);

    const error = await failureOf(
      client.call('battery', { method: 'GET', path: '/now', response: Total }),
    );

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error).toMatchObject({
      service: 'battery',
      reason: 'timeout',
      statusCode: STATUS.UNAVAILABLE,
    });
    expect(log.warn).toHaveBeenCalledWith(
      { service: 'battery', path: '/now', reason: 'timeout' },
      'Service call failed',
    );
  });

  it('reports an unreachable service', async () => {
    const { client } = clientWith(() => Promise.reject(new TypeError('fetch failed')));

    const error = await failureOf(
      client.call('system', { method: 'GET', path: '/x', response: Total }),
    );

    expect(error).toMatchObject({ service: 'system', reason: 'unreachable' });
  });

  it('reports an unexpected status without reading the body', async () => {
    const { client, log } = clientWith(() =>
      Promise.resolve(json({ detail: 'stack trace' }, STATUS.INTERNAL)),
    );

    const error = await failureOf(
      client.call('focus', { method: 'GET', path: '/state', response: Total }),
    );

    expect(error).toMatchObject({ service: 'focus', reason: 'status' });
    expect(log.warn).toHaveBeenCalledWith(
      { service: 'focus', path: '/state', reason: 'status', status: STATUS.INTERNAL },
      'Service call failed',
    );
  });

  it('passes a 404 and a 409 on as NOT_FOUND and CONFLICT', async () => {
    const notFound = clientWith(() => Promise.resolve(json({}, STATUS.NOT_FOUND))).client;
    const conflict = clientWith(() => Promise.resolve(json({}, STATUS.CONFLICT))).client;

    await expect(
      notFound.call('goals', { method: 'GET', path: '/goals/1', response: Total }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      conflict.call('goals', { method: 'PUT', path: '/goals/1', response: Total }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects a reply that is not JSON', async () => {
    const { client } = clientWith(() =>
      Promise.resolve(new Response('<html>', { status: STATUS.OK })),
    );

    const error = await failureOf(
      client.call('sessions', { method: 'GET', path: '/x', response: Total }),
    );

    expect(error).toMatchObject({ reason: 'invalid-response' });
  });

  it('rejects a reply that breaks its schema and logs only field paths', async () => {
    const { client, log } = clientWith(() =>
      Promise.resolve(json({ seconds: -1, title: 'Secret document' })),
    );

    const error = await failureOf(
      client.call('sessions', { method: 'GET', path: '/x', response: Total }),
    );

    expect(error).toMatchObject({ reason: 'invalid-response' });
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('Secret document');
  });

  it('does not log the query string', async () => {
    const { client, log } = clientWith(() => Promise.reject(new TypeError('fetch failed')));

    await failureOf(
      client.call('sessions', {
        method: 'GET',
        path: '/x',
        query: { title: 'Secret' },
        response: Total,
      }),
    );

    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('Secret');
  });
});

describe('orDegraded', () => {
  it('passes a value through', async () => {
    await expect(orDegraded('battery', () => Promise.resolve(ANSWER))).resolves.toEqual({
      value: ANSWER,
    });
  });

  it('turns an unavailable service into null and names the service', async () => {
    const result = await orDegraded('battery', () =>
      Promise.reject(new ServiceUnavailableError('battery', 'timeout')),
    );

    expect(result).toEqual({ value: null, degradedBy: 'battery' });
  });

  it('rethrows any other error', async () => {
    const bug = new TypeError('bug');

    await expect(orDegraded('battery', () => Promise.reject(bug))).rejects.toBe(bug);
  });
});

describe('degradedServices', () => {
  it('lists each unavailable service once, sorted', () => {
    expect(
      degradedServices([
        { value: null, degradedBy: 'system' },
        { value: 1 },
        { value: null, degradedBy: 'battery' },
        { value: null, degradedBy: 'system' },
      ]),
    ).toEqual(['battery', 'system']);
  });

  it('is empty when every call succeeded', () => {
    expect(degradedServices([{ value: 1 }, { value: 'x' }])).toEqual([]);
  });
});
