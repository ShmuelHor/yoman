import type { RateLimitOptions } from '@fastify/rate-limit';
import { type RouteContract, type RouteName, routes } from '@yoman/shared/routes';
import type { FastifyInstance, FastifyReply, FastifyRequest, FastifySchema } from 'fastify';
import { z } from 'zod';

import {
  type Authenticator,
  authenticate,
  type Credentials,
  CSRF_HEADER,
  type Principal,
  SESSION_COOKIE,
  singleHeader,
} from './authenticate.js';
import { InternalError, NotImplementedError, ValidationError } from './errors.js';
import type { AnyRouteHandler, HandlerContext, HandlerMap } from './route-handler.js';
import { type ServiceClient, scopeToRequest } from './service-client.js';
import type { SettingsStore } from './settings-store.js';

const MS_PER_SECOND = 1_000;
export interface RateLimit {
  readonly max: number;
  /** Milliseconds. */
  readonly timeWindow: number;
}

/** SECURITY A17: the agent sends a batch every 60 s, so one per 10 s leaves room for retries. */
export const INGEST_RATE_LIMIT: RateLimit = { max: 1, timeWindow: 10_000 };

export interface ContractRouteDeps {
  readonly auth: Authenticator;
  readonly services: ServiceClient;
  readonly settings: SettingsStore;
  readonly handlers: HandlerMap;
  /** Per-route limits on top of the global one, counted per principal once authenticated. */
  readonly routeRateLimits?: Partial<Record<RouteName, RateLimit>>;
}

/** A part without a schema in the contract must be empty: no stray query keys, no path params. */
const NoFields = z.strictObject({});
/** Fastify hands a missing body to validators as `null`, so "no body" is checked after validation. */
const NoBody = z.undefined();

const ROUTE_NAMES = Object.keys(routes).filter((name): name is RouteName => name in routes);

const principals = new WeakMap<FastifyRequest, Principal>();

function principalOf(request: FastifyRequest): Principal {
  const principal = principals.get(request);
  if (principal === undefined) {
    // The preParsing hook always runs first; reaching here is a wiring bug.
    throw new InternalError();
  }
  return principal;
}

/** Authenticates once, before the body is read, and remembers who it was for the rate limit. */
export function authenticateRequest(
  auth: Authenticator,
  routeAuth: RouteContract['auth'],
  request: FastifyRequest,
): void {
  principals.set(request, authenticate(auth, routeAuth, credentialsOf(request)));
}

function credentialsOf(request: FastifyRequest): Credentials {
  return {
    method: request.method,
    authorization: singleHeader(request.headers.authorization),
    sessionCookie: request.cookies[SESSION_COOKIE],
    csrfToken: singleHeader(request.headers[CSRF_HEADER]),
    origin: singleHeader(request.headers.origin),
  };
}

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

/**
 * Every route, the core's own included, accepts exactly what its contract
 * allows. The type provider's compilers parse each part, and the response,
 * with these schemas; a failure reaches the error handler (`toGatewayError`).
 */
function schemaOf(contract: RouteContract): FastifySchema {
  return {
    params: contract.params ?? NoFields,
    querystring: contract.query ?? NoFields,
    ...(contract.body === undefined ? {} : { body: contract.body }),
    ...(contract.response === null ? {} : { response: { [contract.status]: contract.response } }),
  };
}

/** A route whose contract has no body rejects one, as Zod would: `body` must be `undefined`. */
async function rejectBody(request: FastifyRequest): Promise<void> {
  const result = NoBody.safeParse(request.body);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: 'body', message: issue.message })),
    );
  }
}

/** `GET /v1/session`: a new session cookie, and its CSRF token in the body. */
function sessionHandler(deps: ContractRouteDeps): Handler {
  return async (_request, reply) => {
    const { sessions } = deps.auth;
    const session = sessions.create();
    // Not `Secure`: the gateway is plain HTTP on loopback, and the cookie never leaves the host.
    void reply.setCookie(SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/v1',
      maxAge: Math.floor(sessions.ttlMs / MS_PER_SECOND),
    });
    return { csrfToken: session.csrfToken, expiresAt: new Date(session.expiresAt).toISOString() };
  };
}

function contractHandler(
  contract: RouteContract,
  handler: AnyRouteHandler | undefined,
  deps: ContractRouteDeps,
): Handler {
  return async (request, reply) => {
    const context: HandlerContext<unknown, unknown, unknown> = {
      params: request.params,
      query: request.query,
      body: request.body,
      principal: principalOf(request),
      services: scopeToRequest(deps.services, request.id),
      settings: deps.settings,
      log: request.log,
    };
    if (handler === undefined) {
      throw new NotImplementedError();
    }
    // The validated boundary: every part was parsed by this route's own schemas.
    const result = await handler(context as HandlerContext<never, never, never>);
    reply.status(contract.status);
    // The serializer parses the result with the response schema, so unknown fields never leave.
    return contract.response === null ? reply.send() : result;
  };
}

/**
 * A per-route limit counts authenticated requests only, keyed on the
 * principal. Run in `onRequest` and keyed on the IP, every caller on the
 * host shares one counter, so an unauthenticated request (a 401) could use
 * up the agent's single ingest slot and get its next real batch a 429.
 */
export function afterAuthentication(limit: RateLimit): RateLimitOptions {
  return {
    ...limit,
    // After `preParsing`, where `authenticate` rejects anyone without a credential.
    hook: 'preValidation',
    keyGenerator: (request) => principalOf(request).kind,
  };
}

/**
 * Registers every route of the contract route map, implemented or not, so a
 * route is authenticated and validated from the moment it exists in the
 * contract (ST03, ST08). Routes without a handler answer 501.
 */
export function registerContractRoutes(app: FastifyInstance, deps: ContractRouteDeps): void {
  for (const name of ROUTE_NAMES) {
    const contract: RouteContract = routes[name];
    const rateLimit = deps.routeRateLimits?.[name];
    app.route({
      method: contract.method,
      url: contract.path,
      ...(rateLimit === undefined ? {} : { config: { rateLimit: afterAuthentication(rateLimit) } }),
      // Before the body is read, so an unauthenticated client cannot make the gateway parse 1 MB.
      preParsing: async (request, _reply, payload) => {
        authenticateRequest(deps.auth, contract.auth, request);
        return payload;
      },
      schema: schemaOf(contract),
      ...(contract.body === undefined ? { preHandler: rejectBody } : {}),
      handler:
        name === 'session'
          ? sessionHandler(deps)
          : contractHandler(contract, deps.handlers.get(name), deps),
    });
  }
}
