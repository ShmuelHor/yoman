import { defineRoute, type Route } from '@yoman/service-kit/route';
import { CulpritList, CulpritsQuery } from '@yoman/shared/system';

import { listCulprits } from '../use-cases/list-culprits.js';
import type { RouteDeps } from './route-deps.js';

export function culpritRoutes({ store, now }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/culprits',
      schema: { query: CulpritsQuery, response: CulpritList },
      handler: async ({ query }) => ({
        items: await listCulprits(store, query.days, now().getTime()),
      }),
    }),
  ];
}
