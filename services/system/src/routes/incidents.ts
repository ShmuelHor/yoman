import { defineRoute, type Route } from '@yoman/service-kit/route';
import { TimeRangeQuery } from '@yoman/shared/common';
import { IncidentList } from '@yoman/shared/system';

import { listIncidents } from '../use-cases/list-incidents.js';
import type { RouteDeps } from './route-deps.js';

export function incidentRoutes({ store }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/incidents',
      schema: { query: TimeRangeQuery, response: IncidentList },
      handler: async ({ query }) => ({ items: await listIncidents(store, query) }),
    }),
  ];
}
