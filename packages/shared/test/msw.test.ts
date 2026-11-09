import { getResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { requestFixtures } from '../src/fixtures/requests.js';
import { responseFixtures } from '../src/fixtures/responses.js';
import { createHandlers, invalidRequestBody } from '../src/msw.js';
import { type RouteContract, type RouteName, routes } from '../src/routes.js';

const BASE = 'http://127.0.0.1:4711';
const BAD_REQUEST = 400;
const handlers = createHandlers(BASE);
const all = Object.entries(routes) as [RouteName, RouteContract][];

interface Call {
  params?: Readonly<Record<string, string>> | undefined;
  query?: Readonly<Record<string, string>> | undefined;
  body?: string | undefined;
}

const send = async (route: RouteContract, call: Call): Promise<Response> => {
  const path = route.path.replace(/:(\w+)/g, (_, key: string) =>
    encodeURIComponent(call.params?.[key] ?? ''),
  );
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(call.query ?? {})) {
    url.searchParams.set(key, value);
  }
  const init: RequestInit = { method: route.method };
  if (call.body !== undefined) {
    init.body = call.body;
    init.headers = { 'content-type': 'application/json' };
  }
  const response = await getResponse(handlers, new Request(url, init));
  if (response === undefined) {
    throw new Error(`no handler for ${route.method} ${route.path}`);
  }
  return response;
};

const validCall = (name: RouteName): Call => {
  const { params, query, body } = requestFixtures[name];
  return { params, query, body: body === undefined ? undefined : JSON.stringify(body) };
};

describe('MSW handlers', () => {
  it('registers one handler per route', () => {
    expect(handlers).toHaveLength(all.length);
  });

  it.each(all)('%s serves its fixture for a valid request', async (name, route) => {
    const response = await send(route, validCall(name));
    expect(response.status).toBe(route.status);
    if (route.response === null) {
      expect(await response.text()).toBe('');
    } else {
      expect(await response.json()).toEqual(responseFixtures[name]);
    }
  });

  it.each(all.filter(([, r]) => r.body !== undefined))(
    '%s rejects an invalid or malformed body with 400',
    async (name, route) => {
      for (const body of ['{"unexpected":true}', '{not json', undefined]) {
        const response = await send(route, { ...validCall(name), body });
        expect(response.status, String(body)).toBe(BAD_REQUEST);
        expect(await response.json()).toEqual(invalidRequestBody);
      }
    },
  );

  it.each(all.filter(([, r]) => r.body === undefined && r.method !== 'GET'))(
    '%s rejects an unexpected body with 400',
    async (name, route) => {
      const response = await send(route, { ...validCall(name), body: '{}' });
      expect(response.status).toBe(BAD_REQUEST);
    },
  );

  it.each(all)('%s rejects an unknown query parameter with 400', async (name, route) => {
    const call = validCall(name);
    const response = await send(route, { ...call, query: { ...call.query, injected: '1' } });
    expect(response.status).toBe(BAD_REQUEST);
  });

  it.each(all.filter(([, r]) => r.params !== undefined))(
    '%s rejects an invalid path parameter with 400',
    async (name, route) => {
      const response = await send(route, { ...validCall(name), params: { id: 'bad id' } });
      expect(response.status).toBe(BAD_REQUEST);
    },
  );

  it('serves overridden fixtures', async () => {
    const custom = createHandlers(BASE, { ...responseFixtures, focusState: { active: false } });
    const response = await getResponse(custom, new Request(`${BASE}/v1/focus/state`));
    expect(await response?.json()).toEqual({ active: false });
  });
});
