import { type RouteContract, type RouteName, routes } from '@yoman/shared/routes';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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
import type { ServiceClient } from './service-client.js';

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
  readonly handlers: HandlerMap;
  /** Per-route rate limits on top of the global one. */
  readonly routeRateLimits?: Partial<Record<RouteName, RateLimit>>;
}

/** A part without a schema in the contract must be empty: no stray query keys, no body. */
const NoFields = z.strictObject({});
const NoBody = z.undefined();

function parsePart(schema: z.ZodType, part: string, value: unknown): unknown {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  // Field paths and Zod's messages only; Zod 4 messages never echo the rejected value.
  throw new ValidationError(
    result.error.issues.map((issue) => ({
      path: [part, ...issue.path.map(String)].join('.'),
      message: issue.message,
    })),
  );
}

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

interface RequestParts {
  readonly params: unknown;
  readonly query: unknown;
  readonly body: unknown;
}

/** Every route, the core's own included, accepts exactly what its contract allows. */
function parseParts(contract: RouteContract, request: FastifyRequest): RequestParts {
  return {
    params: parsePart(contract.params ?? NoFields, 'params', request.params),
    query: parsePart(contract.query ?? NoFields, 'query', request.query),
    body: parsePart(contract.body ?? NoBody, 'body', request.body),
  };
}

function checkResponse(contract: RouteContract, request: FastifyRequest, result: unknown): unknown {
  if (contract.response === null) {
    return undefined;
  }
  const checked = contract.response.safeParse(result);
  if (!checked.success) {
    // A handler that breaks its contract is a gateway bug, not the client's fault.
    const paths = checked.error.issues.map((issue) => issue.path.join('.'));
    request.log.error({ paths }, 'Response failed its contract');
    throw new InternalError();
  }
  return checked.data;
}

/** `GET /v1/session`: a new session cookie, and its CSRF token in the body. */
function sessionHandler(contract: RouteContract, deps: ContractRouteDeps): Handler {
  return async (request, reply) => {
    parseParts(contract, request);
    const { sessions } = deps.auth;
    const session = sessions.create();
    // Not `Secure`: the gateway is plain HTTP on loopback, and the cookie never leaves the host.
    void reply.setCookie(SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/v1',
      maxAge: Math.floor(sessions.ttlMs / MS_PER_SECOND),
    });
    return checkResponse(contract, request, {
      csrfToken: session.csrfToken,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
  };
}

function contractHandler(
  contract: RouteContract,
  handler: AnyRouteHandler | undefined,
  deps: ContractRouteDeps,
): Handler {
  return async (request, reply) => {
    const context: HandlerContext<unknown, unknown, unknown> = {
      ...parseParts(contract, request),
      principal: principalOf(request),
      services: deps.services,
      log: request.log,
    };
    if (handler === undefined) {
      throw new NotImplementedError();
    }
    // The validated boundary: every part was just parsed by this route's own schemas.
    const result = await handler(context as HandlerContext<never, never, never>);
    const body = checkResponse(contract, request, result);
    reply.status(contract.status);
    return contract.response === null ? reply.send() : body;
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
      ...(rateLimit === undefined ? {} : { config: { rateLimit } }),
      // Before the body is read, so an unauthenticated client cannot make the gateway parse 1 MB.
      preParsing: async (request, _reply, payload) => {
        principals.set(request, authenticate(deps.auth, contract.auth, credentialsOf(request)));
        return payload;
      },
      handler:
        name === 'session'
          ? sessionHandler(contract, deps)
          : contractHandler(contract, deps.handlers.get(name), deps),
    });
  }
}
