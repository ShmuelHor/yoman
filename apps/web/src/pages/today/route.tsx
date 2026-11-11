import { createRoute } from '@tanstack/react-router';

import type { PageRoute } from '../../router/page-route.js';
import { prefetch } from '../../router/prefetch.js';
import { rootRoute } from '../../router/root-route.js';
import { appsQuery, todayQuery } from './queries.js';
import { TodayPage } from './today-page.js';

function TodayRoute(): React.JSX.Element {
  const { client } = route.useRouteContext();
  return <TodayPage client={client} />;
}

const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: ({ context: { queryClient, client } }): void => {
    prefetch(queryClient, todayQuery(client));
    prefetch(queryClient, appsQuery(client));
  },
  component: TodayRoute,
});

export const page: PageRoute = {
  path: '/',
  namespace: 'today',
  order: 0,
  route,
};
