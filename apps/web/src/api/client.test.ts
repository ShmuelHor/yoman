import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError, createApiClient, type RouteMap } from './client.js';

const BASE = 'http://127.0.0.1:4711';
const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;
const SERVER_ERROR = 500;

const routes = {
  week: {
    method: 'GET',
    path: '/v1/week',
    status: OK,
    query: z.strictObject({ start: z.iso.date().optional() }),
    response: z.strictObject({ total: z.number() }),
  },
  updateApp: {
    method: 'PUT',
    path: '/v1/apps/:id',
    status: OK,
    params: z.strictObject({ id: z.string().min(1) }),
    body: z.strictObject({ name: z.string().max(10) }),
    response: z.strictObject({ id: z.string() }),
  },
  createGoal: {
    method: 'POST',
    path: '/v1/goals',
    status: CREATED,
    body: z.strictObject({ minutes: z.number() }),
    response: z.strictObject({ id: z.number() }),
  },
  deleteGoal: {
    method: 'DELETE',
    path: '/v1/goals/:id',
    status: NO_CONTENT,
    params: z.strictObject({ id: z.string() }),
    response: null,
  },
} as const satisfies RouteMap;

function fakeFetch(status: number, body?: unknown): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

function lastCall(fetchMock: ReturnType<typeof fakeFetch>): [string, RequestInit] {
  const call = fetchMock.mock.calls.at(-1);
  if (call === undefined) {
    throw new Error('fetch was not called');
  }
  return [String(call[0]), call[1] ?? {}];
}

describe('createApiClient', () => {
  it('sends a GET with its query and parses the response', async () => {
    const fetchMock = fakeFetch(OK, { total: 3 });
    const api = createApiClient({ routes, baseUrl: BASE, fetch: fetchMock });

    await expect(api.request('week', { query: { start: '2026-11-02' } })).resolves.toEqual({
      total: 3,
    });

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${BASE}/v1/week?start=2026-11-02`);
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(init.body).toBeUndefined();
  });

  it('leaves out an empty query string', async () => {
    const fetchMock = fakeFetch(OK, { total: 0 });
    const api = createApiClient({ routes, baseUrl: BASE, fetch: fetchMock });

    await api.request('week');

    expect(lastCall(fetchMock)[0]).toBe(`${BASE}/v1/week`);
  });

  it('encodes path parameters and sends a JSON body with extra headers', async () => {
    const fetchMock = fakeFetch(OK, { id: 'a/b' });
    const api = createApiClient({
      routes,
      baseUrl: BASE,
      fetch: fetchMock,
      headers: (route) => (route.method === 'GET' ? {} : { 'X-CSRF-Token': 'token' }),
    });

    await api.request('updateApp', { params: { id: 'a/b' }, body: { name: 'Editor' } });

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${BASE}/v1/apps/a%2Fb`);
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('{"name":"Editor"}');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'token',
    });
  });

  it('accepts the route-specific success status', async () => {
    const api = createApiClient({ routes, baseUrl: BASE, fetch: fakeFetch(CREATED, { id: 7 }) });

    await expect(api.request('createGoal', { body: { minutes: 30 } })).resolves.toEqual({ id: 7 });
  });

  it('resolves to undefined for 204 No Content', async () => {
    const api = createApiClient({ routes, baseUrl: BASE, fetch: fakeFetch(NO_CONTENT) });

    await expect(api.request('deleteGoal', { params: { id: '1' } })).resolves.toBeUndefined();
  });

  it('passes the abort signal to fetch', async () => {
    const fetchMock = fakeFetch(OK, { total: 1 });
    const api = createApiClient({ routes, baseUrl: BASE, fetch: fetchMock });
    const controller = new AbortController();

    await api.request('week', {}, controller.signal);

    expect(lastCall(fetchMock)[1].signal).toBe(controller.signal);
  });

  it('refuses to send a body that breaks the contract', async () => {
    const fetchMock = fakeFetch(OK, { id: 'x' });
    const api = createApiClient({ routes, baseUrl: BASE, fetch: fetchMock });

    await expect(
      api.request('updateApp', { params: { id: 'x' }, body: { name: 'far too long a name' } }),
    ).rejects.toBeInstanceOf(z.ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a query that breaks the contract', async () => {
    const fetchMock = fakeFetch(OK, { total: 1 });
    const api = createApiClient({ routes, baseUrl: BASE, fetch: fetchMock });

    await expect(api.request('week', { query: { start: 'monday' } })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unexpected status with an ApiError', async () => {
    const api = createApiClient({ routes, baseUrl: BASE, fetch: fakeFetch(SERVER_ERROR, {}) });

    const error = await api.request('week').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ route: 'week', status: SERVER_ERROR });
  });

  it('rejects a response outside its contract without echoing it', async () => {
    const api = createApiClient({
      routes,
      baseUrl: BASE,
      fetch: fakeFetch(OK, { total: 'secret window title' }),
    });

    const error = await api.request('week').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(String(error)).not.toContain('secret window title');
  });

  it('fails on a route that is not in the map', async () => {
    const api = createApiClient({ routes, baseUrl: BASE, fetch: fakeFetch(OK) });

    await expect(api.request('nope' as 'week')).rejects.toThrow('unknown route nope');
  });

  it('fails on a path parameter the route has but the schema let through', async () => {
    const loose = {
      app: { method: 'GET', path: '/v1/apps/:id', status: OK, response: null },
    } as const satisfies RouteMap;
    const api = createApiClient({ routes: loose, baseUrl: BASE, fetch: fakeFetch(OK) });

    await expect(api.request('app')).rejects.toThrow('missing path parameter id');
  });
});
