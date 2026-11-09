import type { RouteAuth } from '@yoman/shared/routes';

import { parseBearer, type TokenVerifier } from './agent-token.js';
import { ForbiddenError, UnauthorizedError } from './errors.js';
import { isAllowedOrigin } from './origins.js';
import type { SessionStore } from './web-sessions.js';

/**
 * Who made the request, as proven by `authenticate`. `web-origin` is the web
 * app before it has a session: it may only call `GET /v1/session`.
 */
export type Principal =
  | { readonly kind: 'agent' }
  | { readonly kind: 'session'; readonly id: string }
  | { readonly kind: 'web-origin' };

/** The web's session cookie: `HttpOnly; SameSite=Strict` (SECURITY A3). */
export const SESSION_COOKIE = 'yoman_session';
/** The header the web echoes its CSRF token in, on every state-changing request. */
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The parts of a request that can carry a credential. */
export interface Credentials {
  readonly method: string;
  readonly authorization: string | undefined;
  readonly sessionCookie: string | undefined;
  readonly csrfToken: string | undefined;
  readonly origin: string | undefined;
}

export interface Authenticator {
  readonly verifyAgentToken: TokenVerifier;
  readonly sessions: SessionStore;
}

/**
 * The single `Authorization` or CSRF header value. A repeated header is a
 * request no honest client sends, so it is treated as absent.
 */
export function singleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function agentPrincipal(auth: Authenticator, credentials: Credentials): Principal | undefined {
  if (credentials.authorization === undefined) {
    return undefined;
  }
  const token = parseBearer(credentials.authorization);
  // A wrong or malformed token never falls back to the cookie.
  if (token === undefined || !auth.verifyAgentToken(token)) {
    throw new UnauthorizedError();
  }
  return { kind: 'agent' };
}

function sessionPrincipal(auth: Authenticator, credentials: Credentials): Principal | undefined {
  const session = auth.sessions.find(credentials.sessionCookie);
  if (session === undefined) {
    return undefined;
  }
  // Reads are safe without a CSRF token: CORS keeps a foreign page from seeing the answer.
  if (!SAFE_METHODS.has(credentials.method.toUpperCase())) {
    const sameOrigin = isAllowedOrigin(credentials.origin);
    if (!sameOrigin || !auth.sessions.csrfMatches(session, credentials.csrfToken)) {
      throw new ForbiddenError();
    }
  }
  return { kind: 'session', id: session.id };
}

/** The kinds of principal each route accepts (`packages/shared/src/routes.ts`). */
const ACCEPTS: Readonly<Record<Exclude<RouteAuth, 'origin'>, readonly Principal['kind'][]>> = {
  agent: ['agent'],
  session: ['session'],
  either: ['agent', 'session'],
};

/**
 * Proves who sent a request (SECURITY A3, A5). No credential is 401; a valid
 * credential of the wrong kind, a missing CSRF token or a foreign Origin on a
 * session write is 403. `origin` routes take no credential: the caller only
 * has to be the web app.
 */
export function authenticate(
  auth: Authenticator,
  routeAuth: RouteAuth,
  credentials: Credentials,
): Principal {
  if (routeAuth === 'origin') {
    if (credentials.origin === undefined) {
      throw new UnauthorizedError();
    }
    if (!isAllowedOrigin(credentials.origin)) {
      throw new ForbiddenError();
    }
    return { kind: 'web-origin' };
  }
  const principal = agentPrincipal(auth, credentials) ?? sessionPrincipal(auth, credentials);
  if (principal === undefined) {
    throw new UnauthorizedError();
  }
  if (!ACCEPTS[routeAuth].includes(principal.kind)) {
    throw new ForbiddenError();
  }
  return principal;
}
