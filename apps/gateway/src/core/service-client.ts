import type { ServiceName } from '@yoman/shared/common';
import type { FastifyBaseLogger } from 'fastify';
import type { ZodType } from 'zod';

import {
  ConflictError,
  NotFoundError,
  type ServiceFailure,
  ServiceUnavailableError,
} from './errors.js';

/** SPEC §5 gateway: a service gets 3 s, then the gateway answers without it. */
export const SERVICE_TIMEOUT_MS = 3_000;

const HTTP_NO_CONTENT = 204;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

export type ServiceMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface ServiceRequest<T> {
  readonly method: ServiceMethod;
  /** A path on the service, `/sessions`. Interpolated segments must be validated or encoded. */
  readonly path: `/${string}`;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  /** Every reply is parsed: a service's answer is untrusted until it matches its contract. */
  readonly response: ZodType<T>;
}

export interface ServiceClient {
  /**
   * Calls a service. Throws `ServiceUnavailableError` on a timeout, a network
   * error, an unexpected status or a reply that breaks its schema, and
   * `NotFoundError` or `ConflictError` when the service answers 404 or 409.
   */
  readonly call: <T>(service: ServiceName, request: ServiceRequest<T>) => Promise<T>;
}

export type FetchFunction = (input: URL, init: RequestInit) => Promise<Response>;

export interface ServiceClientOptions {
  readonly urls: Readonly<Record<ServiceName, URL>>;
  readonly log: FastifyBaseLogger;
  readonly timeoutMs?: number;
  readonly fetch?: FetchFunction;
}

interface Reply {
  readonly status: number;
  readonly ok: boolean;
  readonly payload: unknown;
}

function failureOf(error: unknown): ServiceFailure {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'timeout';
  }
  // `response.json()` on a body that is not JSON.
  return error instanceof SyntaxError ? 'invalid-response' : 'unreachable';
}

function buildUrl(base: URL, path: string, query: Readonly<Record<string, string>> = {}): URL {
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export function createServiceClient(options: ServiceClientOptions): ServiceClient {
  const timeoutMs = options.timeoutMs ?? SERVICE_TIMEOUT_MS;
  const fetchFn: FetchFunction =
    options.fetch ?? ((input, init): Promise<Response> => fetch(input, init));

  const fail = (
    service: ServiceName,
    path: string,
    reason: ServiceFailure,
    details: Record<string, unknown> = {},
  ): ServiceUnavailableError => {
    // The path only: queries can carry user filters, and bodies are never logged.
    options.log.warn({ service, path, reason, ...details }, 'Service call failed');
    return new ServiceUnavailableError(service, reason);
  };

  /** One attempt, bounded by the timeout from the first byte sent to the last byte read. */
  const exchange = async (url: URL, request: ServiceRequest<unknown>): Promise<Reply> => {
    const hasBody = request.body !== undefined;
    const response = await fetchFn(url, {
      method: request.method,
      headers: hasBody ? { 'content-type': 'application/json' } : {},
      ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ok = response.ok && response.status !== HTTP_NO_CONTENT;
    // The body of a failed reply is never read: it is the service's business, not the client's.
    return {
      status: response.status,
      ok: response.ok,
      payload: ok ? await response.json() : undefined,
    };
  };

  const call = async <T>(service: ServiceName, request: ServiceRequest<T>): Promise<T> => {
    let reply: Reply;
    try {
      reply = await exchange(buildUrl(options.urls[service], request.path, request.query), request);
    } catch (error: unknown) {
      throw fail(service, request.path, failureOf(error));
    }
    if (reply.status === HTTP_NOT_FOUND) {
      throw new NotFoundError();
    }
    if (reply.status === HTTP_CONFLICT) {
      throw new ConflictError();
    }
    if (!reply.ok) {
      throw fail(service, request.path, 'status', { status: reply.status });
    }
    const parsed = request.response.safeParse(reply.payload);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join('.'));
      throw fail(service, request.path, 'invalid-response', { paths });
    }
    return parsed.data;
  };

  return { call };
}

/** A fan-out result: the value, or `null` with the service that was unavailable. */
export type Degradable<T> =
  | { readonly value: T; readonly degradedBy?: undefined }
  | { readonly value: null; readonly degradedBy: ServiceName };

/**
 * Runs one call of a fan-out (SPEC §3 dashboard flow). An unavailable service
 * becomes `null` instead of failing the whole response; any other error is a
 * real failure and is rethrown.
 */
export async function orDegraded<T>(
  service: ServiceName,
  run: () => Promise<T>,
): Promise<Degradable<T>> {
  try {
    return { value: await run() };
  } catch (error: unknown) {
    if (error instanceof ServiceUnavailableError) {
      return { value: null, degradedBy: service };
    }
    throw error;
  }
}

/** The `degraded` list of a partial response (`{data, degraded:["battery"]}`): sorted, no repeats. */
export function degradedServices(results: readonly Degradable<unknown>[]): ServiceName[] {
  const services = results.flatMap((result) =>
    result.degradedBy === undefined ? [] : [result.degradedBy],
  );
  return [...new Set(services)].sort();
}
