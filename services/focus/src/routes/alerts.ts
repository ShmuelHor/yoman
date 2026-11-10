import { defineRoute, type Route } from '@yoman/service-kit/route';
import { AlertPolicy, AlertQueue } from '@yoman/shared/focus';

import { RouteRequest, RouteResult } from '../contracts.js';
import { readAlertPolicy, replaceAlertPolicy } from '../use-cases/alert-policy.js';
import { listQueue, routeIncoming } from '../use-cases/route-alerts.js';
import type { RouteDeps } from './route-deps.js';

export function alertRoutes({ store, now }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'POST',
      url: '/route',
      schema: { body: RouteRequest, response: RouteResult },
      handler: ({ body }) => routeIncoming(store, body, now()),
    }),
    defineRoute({
      method: 'GET',
      url: '/queue',
      schema: { response: AlertQueue },
      handler: async () => ({ items: await listQueue(store) }),
    }),
    defineRoute({
      method: 'GET',
      url: '/alert-policy',
      schema: { response: AlertPolicy },
      handler: () => readAlertPolicy(store),
    }),
    defineRoute({
      method: 'PUT',
      url: '/alert-policy',
      schema: { body: AlertPolicy, response: AlertPolicy },
      handler: ({ body }) => replaceAlertPolicy(store, body),
    }),
  ];
}
