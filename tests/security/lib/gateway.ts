import { randomBytes } from 'node:crypto';

import { requestFixtures } from '@yoman/shared/fixtures/requests';
import { type RouteContract, type RouteName, routes } from '@yoman/shared/routes';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { pino } from 'pino';

import { buildGateway, type GatewayOptions } from '../../../apps/gateway/src/core/app.js';

export const TOKEN_BYTES = 32;

/** Built at runtime so no token-shaped literal is ever committed. */
export const AGENT_TOKEN = randomBytes(TOKEN_BYTES).toString('base64url');
export const GATEWAY_HOST = '127.0.0.1:4711';
export const WEB_ORIGIN = 'http://127.0.0.1:4710';
export const FOREIGN_ORIGIN = 'http://evil.example';

export const STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  MISDIRECTED: 421,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
} as const;

const UNLIMITED = { max: Number.MAX_SAFE_INTEGER, timeWindow: 60_000 };
/** For suites that send many requests: ST09 tests the real limits. */
export const NO_RATE_LIMIT = { global: UNLIMITED, ingest: UNLIMITED } as const;

export const STATE_CHANGING = new Set(['POST', 'PUT', 'DELETE']);

/** The gateway as it runs in production, minus the network: no route handlers, no services. */
export function securityGateway(options: Partial<GatewayOptions> = {}): Promise<FastifyInstance> {
  return buildGateway({
    logger: pino({ level: 'silent' }),
    agentToken: AGENT_TOKEN,
    services: { call: () => Promise.reject(new Error('no services in the security suite')) },
    ...options,
  });
}

export interface ContractRoute {
  readonly name: RouteName;
  readonly contract: RouteContract;
}

/** Every route of the contracts' route map, so a new route is covered on its own. */
export const contractRoutes: readonly ContractRoute[] = Object.keys(routes)
  .filter((name): name is RouteName => name in routes)
  .map((name) => ({ name, contract: routes[name] }));

/** `/v1/rules/:id` with the fixture's `id`. */
export function pathWith(
  contract: RouteContract,
  params: Readonly<Record<string, string>> = {},
): string {
  return contract.path.replace(/:([A-Za-z]+)/g, (_match, key: string) =>
    encodeURIComponent(params[key] ?? 'missing'),
  );
}

/** A valid request for a route, from the shared fixtures, with the given headers. */
export function validRequest(
  { name, contract }: ContractRoute,
  headers: Readonly<Record<string, string>>,
): InjectOptions {
  const fixture = requestFixtures[name];
  const query = new URLSearchParams(fixture.query ?? {}).toString();
  const hasBody = fixture.body !== undefined;
  return {
    method: contract.method,
    url: `${pathWith(contract, fixture.params)}${query === '' ? '' : `?${query}`}`,
    headers: hasBody ? { ...headers, 'content-type': 'application/json' } : headers,
    ...(hasBody ? { payload: JSON.stringify(fixture.body) } : {}),
  };
}

export const agentHeaders = { host: GATEWAY_HOST, authorization: `Bearer ${AGENT_TOKEN}` };

function sessionCookie(response: LightMyRequestResponse): string {
  const cookie = response.cookies.find((candidate) => candidate.name === 'yoman_session');
  if (cookie === undefined) {
    throw new Error('GET /v1/session set no session cookie');
  }
  return cookie.value;
}

/** Signs in as the web and returns the headers of a complete, valid web request. */
export async function webHeaders(app: FastifyInstance): Promise<Record<string, string>> {
  const response = await app.inject({
    method: 'GET',
    url: '/v1/session',
    headers: { host: GATEWAY_HOST, origin: WEB_ORIGIN },
  });
  const { csrfToken } = response.json<{ csrfToken: string }>();
  return {
    host: GATEWAY_HOST,
    origin: WEB_ORIGIN,
    cookie: `yoman_session=${sessionCookie(response)}`,
    'x-csrf-token': csrfToken,
  };
}

/** The credentials a route accepts: the agent where it may, otherwise a web session. */
export async function credentialsFor(
  app: FastifyInstance,
  contract: RouteContract,
): Promise<Record<string, string>> {
  if (contract.auth === 'origin') {
    return { host: GATEWAY_HOST, origin: WEB_ORIGIN };
  }
  return contract.auth === 'session' ? webHeaders(app) : agentHeaders;
}
