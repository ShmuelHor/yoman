import { createRoute } from '@tanstack/react-router';

import type { PageRoute } from '../../router/page-route.js';
import { prefetch } from '../../router/prefetch.js';
import { rootRoute } from '../../router/root-route.js';
import { GoalsPage } from './goals-page.js';
import { appsQuery, goalProgressQuery, goalsQuery, localDate } from './queries.js';

function GoalsRoute(): React.JSX.Element {
  const { client } = route.useRouteContext();
  return <GoalsPage client={client} />;
}

const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/goals',
  loader: ({ context: { queryClient, client } }): void => {
    prefetch(queryClient, goalsQuery(client));
    prefetch(queryClient, goalProgressQuery(client, localDate(new Date())));
    prefetch(queryClient, appsQuery(client));
  },
  component: GoalsRoute,
});

export const page: PageRoute = {
  path: 'goals',
  namespace: 'goals',
  order: 50,
  route,
};
