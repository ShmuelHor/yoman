import { defineRoute, type Route } from '@yoman/service-kit/route';
import { KnownAppList, KnownAppsReport, KnownAppsResult } from '@yoman/shared/focus';

import { listKnownApps, reportKnownApps } from '../use-cases/known-apps.js';
import type { RouteDeps } from './route-deps.js';

export function knownAppRoutes({ store }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/known-apps',
      schema: { response: KnownAppList },
      handler: async () => ({ items: await listKnownApps(store) }),
    }),
    defineRoute({
      method: 'POST',
      url: '/known-apps',
      schema: { body: KnownAppsReport, response: KnownAppsResult },
      handler: async ({ body }) => ({ added: await reportKnownApps(store, body) }),
    }),
  ];
}
