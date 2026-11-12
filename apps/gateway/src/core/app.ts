import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyRequest,
} from 'fastify';
import {
  ResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';

import { createTokenVerifier } from './agent-token.js';
import { registerApiDocs } from './api-docs.js';
import { CSRF_HEADER } from './authenticate.js';
import { registerClientErrorRoute } from './client-errors.js';
import { INGEST_RATE_LIMIT, type RateLimit, registerContractRoutes } from './contract-routes.js';
import {
  ForbiddenError,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL,
  MisdirectedRequestError,
  NotFoundError,
  RateLimitedError,
  toErrorBody,
  toGatewayError,
} from './errors.js';
import { ALLOWED_ORIGINS, isAllowedHost, isAllowedOrigin } from './origins.js';
import { REQUEST_ID_HEADER, REQUEST_ID_LOG_LABEL, resolveRequestId } from './request-id.js';
import type { HandlerMap } from './route-handler.js';
import { CACHE_CONTROL, HELMET_OPTIONS } from './security-headers.js';
import type { ServiceClient } from './service-client.js';
import type { SettingsStore } from './settings-store.js';
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
  readonly settings: SettingsStore;
  readonly handlers?: HandlerMap;
  readonly sessions?: SessionStore;
  readonly rateLimits?: { readonly global?: RateLimit; readonly ingest?: RateLimit };
  /** Serve the OpenAPI document and Swagger UI under `/docs`. Development only. */
  readonly apiDocs?: boolean;
}

async function registerRequestGuards(app: FastifyInstance): Promise<void> {
  // Before the guards below, so a rejected request carries the security headers too (ST07).
  await app.register(helmet, HELMET_OPTIONS);
  app.addHook('onSend', async (_request, reply, payload) => {
    void reply.header('cache-control', CACHE_CONTROL);
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

function logFailure(request: FastifyRequest, error: unknown): void {
  if (error instanceof ResponseSerializationError) {
    // A handler that breaks its contract is a gateway bug. Paths only: the values are user data.
    const paths = error.cause.issues.map((issue) => issue.path.join('.'));
    request.log.error({ paths }, 'Response failed its contract');
    return;
  }
  request.log.error({ err: error }, 'Request failed');
}

/** The one place a failure is logged in full, once, and turned into a client body. */
function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const gatewayError = toGatewayError(error);
    if (gatewayError.statusCode >= HTTP_INTERNAL) {
      logFailure(request, error);
    }
    return reply.status(gatewayError.statusCode).send(toErrorBody(gatewayError, request.id));
  });
  app.setNotFoundHandler((request, reply) => {
    const error = new NotFoundError();
    return reply.status(error.statusCode).send(toErrorBody(error, request.id));
  });
}

/** Server errors are errors, client mistakes are warnings, everything else is routine. */
function levelOf(status: number): 'info' | 'warn' | 'error' {
  if (status >= HTTP_INTERNAL) {
    return 'error';
  }
  return status >= HTTP_BAD_REQUEST ? 'warn' : 'info';
}

/**
 * A line when a request arrives and one when it is answered, both with `reqId`
 * from the request's child logger, and the id echoed in the response. The route
 * is the pattern, never the URL: ids and query strings stay out of the line.
 */
function registerRequestLog(app: FastifyInstance): void {
  const routeOf = (request: FastifyRequest): string => request.routeOptions.url ?? 'unmatched';
  app.addHook('onRequest', async (request) => {
    request.log.info(
      { method: request.method, route: routeOf(request) },
      `→ ${request.method} ${routeOf(request)}`,
    );
  });
  app.addHook('onSend', async (request, reply, payload) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
    return payload;
  });
  app.addHook('onResponse', async (request, reply) => {
    const status = reply.statusCode;
    const durationMs = Math.round(reply.elapsedTime);
    request.log[levelOf(status)](
      { method: request.method, route: routeOf(request), status, durationMs },
      `← ${request.method} ${routeOf(request)} ${status} ${durationMs}ms`,
    );
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
    // Replaced by the arrow lines of `registerRequestLog`, which carry the route pattern.
    disableRequestLogging: true,
    genReqId: resolveRequestId,
    requestIdLogLabel: REQUEST_ID_LOG_LABEL,
    bodyLimit: BODY_LIMIT_BYTES,
    exposeHeadRoutes: false,
    requestTimeout: REQUEST_TIMEOUT_MS,
    routerOptions: { maxParamLength: MAX_PARAM_LENGTH },
  });
  // Request parts and responses are parsed by the contracts' own Zod schemas.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerRequestLog(app);
  registerErrorHandlers(app);
  await registerRequestGuards(app);

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
  if (options.apiDocs === true) {
    await registerApiDocs(app);
  }

  // Polled by Docker; it carries no data, so it needs no credential and no rate limit.
  app.get('/health', { logLevel: 'warn', config: { rateLimit: false } }, async () => ({
    status: 'ok',
  }));

  const auth = {
    verifyAgentToken: createTokenVerifier(options.agentToken),
    sessions: options.sessions ?? createSessionStore(),
  };
  registerClientErrorRoute(app, auth);
  registerContractRoutes(app, {
    auth,
    services: options.services,
    settings: options.settings,
    handlers: options.handlers ?? new Map(),
    routeRateLimits: { ingest: options.rateLimits?.ingest ?? INGEST_RATE_LIMIT },
  });
  await app.ready();
  return app;
}
