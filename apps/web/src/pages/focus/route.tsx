import { createRoute } from '@tanstack/react-router';

import type { PageRoute } from '../../router/page-route.js';
import { prefetch } from '../../router/prefetch.js';
import { rootRoute } from '../../router/root-route.js';
import { FocusPage } from './focus-page.js';
import {
  alertPolicyQuery,
  alertQueueQuery,
  focusStateQuery,
  knownAppsQuery,
  profilesQuery,
} from './queries.js';

function FocusRoute(): React.JSX.Element {
  const { client } = route.useRouteContext();
  return <FocusPage client={client} />;
}

const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/focus',
  loader: ({ context: { queryClient, client } }): void => {
    prefetch(queryClient, focusStateQuery(client));
    prefetch(queryClient, profilesQuery(client));
    prefetch(queryClient, knownAppsQuery(client));
    prefetch(queryClient, alertQueueQuery(client));
    prefetch(queryClient, alertPolicyQuery(client));
  },
  component: FocusRoute,
});

export const page: PageRoute = {
  path: 'focus',
  namespace: 'focus',
  order: 60,
  route,
};
