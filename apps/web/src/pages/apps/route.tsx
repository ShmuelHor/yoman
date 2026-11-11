import { createRoute } from '@tanstack/react-router';

import type { PageRoute } from '../../router/page-route.js';
import { prefetch } from '../../router/prefetch.js';
import { rootRoute } from '../../router/root-route.js';
import { AppsPage } from './apps-page.js';
import { appsQuery, rulesQuery } from './queries.js';

function AppsRoute(): React.JSX.Element {
  const { client } = route.useRouteContext();
  return <AppsPage client={client} />;
}

const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/apps',
  loader: ({ context: { queryClient, client } }): void => {
    prefetch(queryClient, appsQuery(client));
    prefetch(queryClient, rulesQuery(client));
  },
  component: AppsRoute,
});

export const page: PageRoute = {
  path: 'apps',
  namespace: 'apps',
  order: 20,
  route,
};
