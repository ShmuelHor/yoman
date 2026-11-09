import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import { createTokenVerifier } from './agent-token.js';
import { CSRF_HEADER } from './authenticate.js';
import { INGEST_RATE_LIMIT, type RateLimit, registerContractRoutes } from './contract-routes.js';
import {
  ForbiddenError,
  HTTP_INTERNAL,
  MisdirectedRequestError,
  NotFoundError,
  RateLimitedError,
  toErrorBody,
  toGatewayError,
} from './errors.js';
import { ALLOWED_ORIGINS, isAllowedHost, isAllowedOrigin } from './origins.js';
import type { HandlerMap } from './route-handler.js';
import { SECURITY_HEADERS } from './security-headers.js';
import type { ServiceClient } from './service-client.js';
import { createSessionStore, type SessionStore } from './web-sessions.js';

/** SECURITY A17: 1 MB per request body. */
export const BODY_LIMIT_BYTES = 1_048_576;
/** SECURITY A17: 300 requests per minute from the web (and the CLI and tray). */
export const GLOBAL_RATE_LIMIT: RateLimit = { max: 300, timeWindow: 60_000 };
/** Longer than any contract parameter, so an oversized one is a 400 from Zod, not a router 404. */
const MAX_PARAM_LENGTH = 1_024;
/** A slow client cannot hold a connection open. */
const REQUEST_TIMEOUT_MS = 10_000;
/** Lets the browser cache a preflight for 10 minutes. */
const PREFLIGHT_MAX_AGE_S = 600;

export interface GatewayOptions {
  readonly logger: FastifyBaseLogger;
  readonly agentToken: string;
  readonly services: ServiceClient;
  readonly handlers?: HandlerMap;
  readonly sessions?: SessionStore;
  readonly rateLimits?: { readonly global?: RateLimit; readonly ingest?: RateLimit };
}

function registerRequestGuards(app: FastifyInstance): void {
  app.addHook('onSend', async (_request, reply, payload) => {
    void reply.headers(SECURITY_HEADERS);
    return payload;
  });
  // First, before routing, CORS and the rate limit: a rebinding attempt gets nothing (SECURITY A4).
  app.addHook('onRequest', async (request) => {
    if (!isAllowedHost(request.headers.host)) {
      throw new MisdirectedRequestError();
    }
    // A browser always names the page that sent a cross-origin request. Only the web may (A3).
    const { origin } = request.headers;
    if (origin !== undefined && !isAllowedOrigin(origin)) {
      throw new ForbiddenError();
    }
  });
}

function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const gatewayError = toGatewayError(error);
    if (gatewayError.statusCode >= HTTP_INTERNAL) {
      request.log.error({ err: error }, 'Request failed');
    }
    return reply.status(gatewayError.statusCode).send(toErrorBody(gatewayError));
  });
  app.setNotFoundHandler((_request, reply) => {
    const error = new NotFoundError();
    return reply.status(error.statusCode).send(toErrorBody(error));
  });
}

/**
 * The gateway's HTTP server, without listening. Every request passes, in
 * order: the Host allowlist (421), the Origin check (403), CORS, the rate
 * limit (429), authentication and CSRF (401/403), the body limit (413) and
 * contract validation (400).
 */
export async function buildGateway(options: GatewayOptions): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: options.logger,
    bodyLimit: BODY_LIMIT_BYTES,
    exposeHeadRoutes: false,
    requestTimeout: REQUEST_TIMEOUT_MS,
    routerOptions: { maxParamLength: MAX_PARAM_LENGTH },
  });
  registerErrorHandlers(app);
  registerRequestGuards(app);

  await app.register(cors, {
    origin: [...ALLOWED_ORIGINS],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['content-type', CSRF_HEADER],
    maxAge: PREFLIGHT_MAX_AGE_S,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    ...(options.rateLimits?.global ?? GLOBAL_RATE_LIMIT),
    errorResponseBuilder: () => new RateLimitedError(),
  });

  // Polled by Docker; it carries no data, so it needs no credential and no rate limit.
  app.get('/health', { logLevel: 'warn', config: { rateLimit: false } }, async () => ({
    status: 'ok',
  }));

  registerContractRoutes(app, {
    auth: {
      verifyAgentToken: createTokenVerifier(options.agentToken),
      sessions: options.sessions ?? createSessionStore(),
    },
    services: options.services,
    handlers: options.handlers ?? new Map(),
    routeRateLimits: { ingest: options.rateLimits?.ingest ?? INGEST_RATE_LIMIT },
  });
  await app.ready();
  return app;
}
