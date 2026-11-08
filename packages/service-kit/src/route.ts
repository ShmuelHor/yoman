import type { FastifyBaseLogger } from 'fastify';
import type { ZodType } from 'zod';

import { InternalError } from './errors.js';
import { parseRequestPart, toFieldIssues } from './validation.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const HTTP_OK = 200;
export const HTTP_NO_CONTENT = 204;

/** A part without a schema is not read at all: the handler sees `undefined`. */
export interface RouteSchemas<Params, Query, Body, Response> {
  readonly params?: ZodType<Params>;
  readonly query?: ZodType<Query>;
  readonly body?: ZodType<Body>;
  /** Required. The handler's result is parsed by it, so unknown fields never leave the service. */
  readonly response: ZodType<Response>;
}

export interface RequestContext<Params, Query, Body> {
  readonly params: Params;
  readonly query: Query;
  readonly body: Body;
  readonly log: FastifyBaseLogger;
}

export interface RouteSpec<Params, Query, Body, Response> {
  readonly method: HttpMethod;
  readonly url: string;
  /** Defaults to 200. With 204 the response schema must accept `undefined`. */
  readonly status?: number;
  readonly schema: RouteSchemas<Params, Query, Body, Response>;
  readonly handler: (context: RequestContext<Params, Query, Body>) => Promise<Response> | Response;
}

export interface RawRequest {
  readonly params: unknown;
  readonly query: unknown;
  readonly body: unknown;
}

/** A route with its types erased, ready to register. Validation happens inside `handle`. */
export interface Route {
  readonly method: HttpMethod;
  readonly url: string;
  readonly status: number;
  readonly handle: (request: RawRequest, log: FastifyBaseLogger) => Promise<unknown>;
}

function parseOptional<T>(schema: ZodType<T> | undefined, part: string, value: unknown): T {
  return schema === undefined ? (undefined as T) : parseRequestPart(schema, part, value);
}

export function defineRoute<
  Params = undefined,
  Query = undefined,
  Body = undefined,
  Response = unknown,
>(spec: RouteSpec<Params, Query, Body, Response>): Route {
  const { schema } = spec;
  return {
    method: spec.method,
    url: spec.url,
    status: spec.status ?? HTTP_OK,
    handle: async (request, log): Promise<unknown> => {
      const context: RequestContext<Params, Query, Body> = {
        params: parseOptional(schema.params, 'params', request.params),
        query: parseOptional(schema.query, 'query', request.query),
        body: parseOptional(schema.body, 'body', request.body),
        log,
      };
      const result = await spec.handler(context);
      const checked = schema.response.safeParse(result);
      if (!checked.success) {
        // A broken contract is a bug in this service, not the client's fault.
        log.error({ issues: toFieldIssues(checked.error) }, 'Response failed its schema');
        throw new InternalError();
      }
      return checked.data;
    },
  };
}
