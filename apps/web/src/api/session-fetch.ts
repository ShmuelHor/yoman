import { WebSession } from '@yoman/shared/gateway';

const UNAUTHORIZED = 401;
const SESSION_PATH = '/v1/session';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Wraps `fetch` with the gateway's web session (SECURITY A3). The session is
 * opened once, before the first call, and its CSRF token goes on every
 * state-changing request. A 401 means the session expired or the gateway
 * restarted: the session is opened again and that one request is retried once.
 * A second 401 is returned as is, so a broken gateway is never hammered.
 */
export function withWebSession(baseUrl: string, send: typeof fetch): typeof fetch {
  let csrfToken: Promise<string> | undefined;

  const open = async (): Promise<string> => {
    const response = await send(`${baseUrl}${SESSION_PATH}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`session answered ${response.status}`);
    }
    return WebSession.parse(await response.json()).csrfToken;
  };

  // One shared attempt per generation, so parallel first queries open one session.
  const ensure = (stale?: Promise<string>): Promise<string> => {
    if (csrfToken === undefined || csrfToken === stale) {
      const attempt = open();
      csrfToken = attempt;
      // A failed attempt is forgotten so a later call may try again.
      attempt.catch(() => {
        if (csrfToken === attempt) {
          csrfToken = undefined;
        }
      });
    }
    return csrfToken;
  };

  const call = async (
    input: Parameters<typeof fetch>[0],
    init: RequestInit,
    token: string,
  ): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (!SAFE_METHODS.has((init.method ?? 'GET').toUpperCase())) {
      headers.set(CSRF_HEADER, token);
    }
    return send(input, { ...init, headers });
  };

  return async (input, init = {}) => {
    if (String(input).endsWith(SESSION_PATH)) {
      return send(input, init);
    }
    const used = ensure();
    const first = await call(input, init, await used);
    if (first.status !== UNAUTHORIZED) {
      return first;
    }
    return call(input, init, await ensure(used));
  };
}
