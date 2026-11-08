import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { type Pingable, pingDatabase } from './database.js';
import {
  AppError,
  BadRequestError,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL,
  InternalError,
  NotFoundError,
  toErrorBody,
} from './errors.js';
import type { Route } from './route.js';

const HTTP_OK = 200;
const HTTP_UNAVAILABLE = 503;

export interface AppOptions {
  readonly logger: FastifyBaseLogger;
  readonly routes: readonly Route[];
  readonly db: Pingable;
}

export interface HealthBody {
  readonly status: 'ok' | 'unavailable';
  readonly checks: { readonly database: 'ok' | 'down' };
}

function statusCodeOf(error: unknown): number {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === 'number' ? status : HTTP_INTERNAL;
}

/**
 * Maps every failure to the typed error body. Only `AppError` messages are
 * shown to clients; anything else gets a fixed message, so stacks, SQL and
 * echoed input stay inside the service.
 */
function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  const status = statusCodeOf(error);
  if (status >= HTTP_BAD_REQUEST && status < HTTP_INTERNAL) {
    return new BadRequestError(status);
  }
  return new InternalError();
}

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ loggerInstance: options.logger });

  app.setErrorHandler((error, request, reply) => {
    const appError = toAppError(error);
    if (appError.statusCode >= HTTP_INTERNAL) {
      request.log.error({ err: error }, 'Request failed');
    }
    return reply.status(appError.statusCode).send(toErrorBody(appError));
  });

  app.setNotFoundHandler((_request, reply) => {
    const error = new NotFoundError();
    return reply.status(error.statusCode).send(toErrorBody(error));
  });

  // Polled every few seconds by Docker, so successful checks stay out of the log.
  app.get('/health', { logLevel: 'warn' }, async (request, reply) => {
    const up = await pingDatabase(options.db);
    if (!up) {
      request.log.warn('Health check: database is down');
    }
    const body: HealthBody = {
      status: up ? 'ok' : 'unavailable',
      checks: { database: up ? 'ok' : 'down' },
    };
    return reply.status(up ? HTTP_OK : HTTP_UNAVAILABLE).send(body);
  });

  for (const route of options.routes) {
    app.route({
      method: route.method,
      url: route.url,
      handler: async (request, reply) => {
        const { params, query, body } = request;
        const result = await route.handle({ params, query, body }, request.log);
        return reply.status(route.status).send(result);
      },
    });
  }

  return app;
}
