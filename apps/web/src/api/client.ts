import type { z } from 'zod';

/**
 * The parts of a route contract the client needs. `@yoman/shared`'s
 * `RouteContract` (T08) satisfies it, so its route map plugs in unchanged.
 */
export interface ApiRoute {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly path: `/v1/${string}`;
  readonly status: number;
  readonly params?: z.ZodType;
  readonly query?: z.ZodType;
  readonly body?: z.ZodType;
  /** `null` when the route answers `204 No Content`. */
  readonly response: z.ZodType | null;
}

export type RouteMap = Readonly<Record<string, ApiRoute>>;

type InputPart<R, K extends 'params' | 'query' | 'body'> = R extends {
  readonly [P in K]: infer S extends z.ZodType;
}
  ? { readonly [P in K]: z.input<S> }
  : { readonly [P in K]?: never };

/** A query may be left out when every field in it is optional. */
type QueryPart<R> = R extends { readonly query: infer S extends z.ZodType }
  ? Record<never, never> extends z.input<S>
    ? { readonly query?: z.input<S> }
    : { readonly query: z.input<S> }
  : { readonly query?: never };

/** What a call passes: exactly the parts its route declares. */
export type RouteInput<R extends ApiRoute> = InputPart<R, 'params'> &
  QueryPart<R> &
  InputPart<R, 'body'>;

/** What a call resolves to: the parsed response, or `undefined` for 204. */
export type RouteOutput<R extends ApiRoute> = R['response'] extends z.ZodType
  ? z.output<R['response']>
  : undefined;

/** A non-success status or a response that breaks its contract. */
export class ApiError extends Error {
  constructor(
    readonly route: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions<M extends RouteMap> {
  readonly routes: M;
  /** The gateway origin, such as `http://127.0.0.1:4711`. */
  readonly baseUrl: string;
  /** Extra headers per call; the CSRF token goes here once sessions exist (T19). */
  readonly headers?: (route: ApiRoute) => Record<string, string>;
  readonly fetch?: typeof fetch;
}

export interface ApiClient<M extends RouteMap> {
  request<N extends keyof M & string>(
    name: N,
    input?: RouteInput<M[N]>,
    signal?: AbortSignal,
  ): Promise<RouteOutput<M[N]>>;
}

type Scalar = string | number | boolean;

function fillPath(path: string, params: Readonly<Record<string, Scalar>>): string {
  return path.replace(/:([A-Za-z]\w*)/gu, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`missing path parameter ${name}`);
    }
    return encodeURIComponent(String(value));
  });
}

function queryString(query: Readonly<Record<string, Scalar | undefined>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

/** Parses with `schema` when the route has one, so bad input never leaves the browser. */
function check<T>(schema: z.ZodType | undefined, value: T): T {
  return schema === undefined ? value : (schema.parse(value) as T);
}

/**
 * A typed client over a route map. Every request is checked against the
 * contract before it is sent, and every response is parsed with the route's
 * response schema: the gateway is a trust boundary in both directions.
 */
export function createApiClient<M extends RouteMap>(options: ApiClientOptions<M>): ApiClient<M> {
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  return {
    async request<N extends keyof M & string>(
      name: N,
      input?: RouteInput<M[N]>,
      signal?: AbortSignal,
    ): Promise<RouteOutput<M[N]>> {
      const route = options.routes[name];
      if (route === undefined) {
        throw new Error(`unknown route ${name}`);
      }
      const {
        params = {},
        query = {},
        body,
      } = (input ?? {}) as {
        params?: Record<string, Scalar>;
        query?: Record<string, Scalar | undefined>;
        body?: unknown;
      };
      const url = `${options.baseUrl}${fillPath(route.path, check(route.params, params))}${queryString(check(route.query, query))}`;
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...options.headers?.(route),
      };
      const init: RequestInit = { method: route.method, headers, credentials: 'include' };
      if (route.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(route.body.parse(body));
      }
      if (signal !== undefined) {
        init.signal = signal;
      }
      const response = await send(url, init);
      if (response.status !== route.status) {
        throw new ApiError(name, response.status, `${name} answered ${response.status}`);
      }
      if (route.response === null) {
        return undefined as RouteOutput<M[N]>;
      }
      const parsed = route.response.safeParse(await response.json());
      if (!parsed.success) {
        throw new ApiError(name, response.status, `${name} answered outside its contract`);
      }
      return parsed.data as RouteOutput<M[N]>;
    },
  };
}
