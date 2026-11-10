import { type RouteContract, type RouteName, routes } from '@yoman/shared/routes';
import type { FastifyBaseLogger } from 'fastify';
import type { z } from 'zod';

import type { Principal } from './authenticate.js';
import type { ServiceClient } from './service-client.js';

export interface HandlerContext<Params, Query, Body> {
  /** Already validated against the route's contract. */
  readonly params: Params;
  readonly query: Query;
  readonly body: Body;
  readonly principal: Principal;
  readonly services: ServiceClient;
  readonly log: FastifyBaseLogger;
}

type Contract<K extends RouteName> = (typeof routes)[K];

/** The parsed type of a request part, or `undefined` when the contract has no schema for it. */
type PartOf<C, Part extends 'params' | 'query' | 'body'> = C extends {
  readonly [P in Part]: infer Schema extends z.ZodType;
}
  ? z.output<Schema>
  : undefined;

/**
 * What a handler returns: the output type of the response schema, which the
 * serializer checks (`safeEncode`) before anything is sent.
 */
type ResultOf<C extends RouteContract> = C['response'] extends z.ZodType
  ? z.output<C['response']>
  : undefined;

export type RouteHandler<K extends RouteName> = (
  context: HandlerContext<
    PartOf<Contract<K>, 'params'>,
    PartOf<Contract<K>, 'query'>,
    PartOf<Contract<K>, 'body'>
  >,
) => Promise<ResultOf<Contract<K>>>;

/** `GET /v1/session` belongs to the gateway core: it issues the credentials. */
export type HandledRouteName = Exclude<RouteName, 'session'>;

export const HANDLED_ROUTE_NAMES: readonly HandledRouteName[] = Object.keys(routes).filter(
  (name): name is HandledRouteName => name !== 'session',
);

export type RouteHandlers = { readonly [K in HandledRouteName]?: RouteHandler<K> };

/**
 * Declares a route module's handlers, typed from the contract route map. Each
 * `src/routes/<domain>/index.ts` exports `handlers = defineHandlers({ ... })`.
 */
export function defineHandlers(handlers: RouteHandlers): RouteHandlers {
  return handlers;
}

/**
 * A handler with its contract types erased, as the gateway registers it. Any
 * `RouteHandler<K>` is assignable to it; it is only ever called with request
 * parts that were parsed by that route's own schemas.
 */
export type AnyRouteHandler = (context: HandlerContext<never, never, never>) => Promise<unknown>;

export type HandlerMap = ReadonlyMap<HandledRouteName, AnyRouteHandler>;

/** Indexes typed handlers by route name, ready for `buildGateway`. */
export function toHandlerMap(handlers: RouteHandlers): HandlerMap {
  const map = new Map<HandledRouteName, AnyRouteHandler>();
  for (const name of HANDLED_ROUTE_NAMES) {
    const handler: AnyRouteHandler | undefined = handlers[name];
    if (handler !== undefined) {
      map.set(name, handler);
    }
  }
  return map;
}
