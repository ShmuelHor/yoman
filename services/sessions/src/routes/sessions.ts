import { defineRoute, type Route } from '@yoman/service-kit/route';
import { TimeRangeQuery } from '@yoman/shared/common';

import { SessionList } from '../contracts.js';
import { listSessions } from '../use-cases/list-sessions.js';
import type { RouteDeps } from './route-deps.js';

export function sessionRoutes({ store }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/sessions',
      schema: { query: TimeRangeQuery, response: SessionList },
      handler: async ({ query }) => ({ items: await listSessions(store, query) }),
    }),
  ];
}
