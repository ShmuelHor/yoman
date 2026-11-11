import { requestFixtures } from '@yoman/shared/fixtures/requests';
import { describe, expect, it, vi } from 'vitest';

import { createGatewayClient } from '../../src/api/gateway.js';

const location = { protocol: 'http:', hostname: '127.0.0.1' };
const BASE = 'http://127.0.0.1:4711';
const OK = 200;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const CSRF = 'x'.repeat(32);

const today = {
  data: { reports: null, battery: null, openIncidents: null, focus: null },
  degraded: [],
};

/** A gateway that answers data only to a caller holding the cookie, and writes only with the CSRF token. */
function fakeGateway(): {
  fetch: typeof fetch;
  calls: string[];
  expireSession: () => void;
  seen: Headers[];
} {
  let valid = false;
  const calls: string[] = [];
  const seen: Headers[] = [];
  const json = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...extra },
    });
  const fake = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input).replace(BASE, '');
    const headers = new Headers(init?.headers);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    seen.push(headers);
    if (url === '/v1/session') {
      valid = true;
      return json(OK, { csrfToken: CSRF, expiresAt: '2030-01-01T00:00:00.000Z' });
    }
    if (!valid) {
      return json(UNAUTHORIZED, { code: 'unauthorized' });
    }
    if (init?.method === 'PUT' && headers.get('x-csrf-token') !== CSRF) {
      return json(FORBIDDEN, { code: 'forbidden' });
    }
    return json(OK, init?.method === 'PUT' ? requestFixtures.updateSettings.body : today);
  });
  return { fetch: fake, calls, seen, expireSession: () => (valid = false) };
}

describe('gateway session bootstrap', () => {
  it('opens the session once before the first call, even for parallel calls', async () => {
    const gateway = fakeGateway();
    const api = createGatewayClient(location, gateway.fetch);

    await Promise.all([api.request('dashboardToday'), api.request('dashboardToday')]);

    expect(gateway.calls.filter((call) => call.endsWith('/v1/session'))).toHaveLength(1);
    expect(gateway.calls[0]).toBe('GET /v1/session');
  });

  it('re-opens the session once on 401, then retries the call', async () => {
    const gateway = fakeGateway();
    const api = createGatewayClient(location, gateway.fetch);
    await api.request('dashboardToday');
    gateway.expireSession();
    gateway.calls.length = 0;

    await api.request('dashboardToday');

    expect(gateway.calls).toEqual([
      'GET /v1/dashboard/today',
      'GET /v1/session',
      'GET /v1/dashboard/today',
    ]);
  });

  it('does not loop when the gateway keeps answering 401', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith('/v1/session')
        ? new Response(JSON.stringify({ csrfToken: CSRF, expiresAt: '2030-01-01T00:00:00.000Z' }))
        : new Response('{}', { status: UNAUTHORIZED }),
    );
    const api = createGatewayClient(location, fetchImpl);

    await expect(api.request('dashboardToday')).rejects.toMatchObject({ status: UNAUTHORIZED });

    // session, call, session, call
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('sends the CSRF token on writes only', async () => {
    const gateway = fakeGateway();
    const api = createGatewayClient(location, gateway.fetch);

    await api.request('dashboardToday');
    await api.request('updateSettings', requestFixtures.updateSettings);

    // seen: session, read, write
    expect(gateway.seen[1]?.get('x-csrf-token')).toBeNull();
    expect(gateway.seen[2]?.get('x-csrf-token')).toBe(CSRF);
  });

  it('opens the session again after a failed attempt', async () => {
    const gateway = fakeGateway();
    const failing = vi.fn<typeof fetch>(async (input, init) =>
      failing.mock.calls.length === 1
        ? new Response('{}', { status: 500 })
        : gateway.fetch(input, init),
    );
    const api = createGatewayClient(location, failing);

    await expect(api.request('dashboardToday')).rejects.toThrow();
    await expect(api.request('dashboardToday')).resolves.toBeDefined();
  });
});
