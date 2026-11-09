import { defineRoute, type Route } from '@yoman/service-kit/route';
import { AppIdParams } from '@yoman/shared/common';
import { App, AppList, AppUpdate } from '@yoman/shared/sessions';

import { listApps, updateApp } from '../use-cases/manage-apps.js';
import type { RouteDeps } from './route-deps.js';

export function appRoutes({ store, now }: RouteDeps): Route[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/apps',
      schema: { response: AppList },
      handler: async () => ({ items: await listApps(store) }),
    }),
    defineRoute({
      method: 'PUT',
      url: '/apps/:id',
      schema: { params: AppIdParams, body: AppUpdate, response: App },
      handler: ({ params, body }) => updateApp(store, params.id, body, now()),
    }),
  ];
}
