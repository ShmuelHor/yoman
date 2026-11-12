import { createRoute } from '@tanstack/react-router';

import type { PageRoute } from '../../router/page-route.js';
import { prefetch } from '../../router/prefetch.js';
import { rootRoute } from '../../router/root-route.js';
import { settingsQuery } from './queries.js';
import { SettingsPage } from './settings-page.js';

function SettingsRoute(): React.JSX.Element {
  const { client } = route.useRouteContext();
  return <SettingsPage client={client} />;
}

const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  loader: ({ context: { queryClient, client } }): void => {
    prefetch(queryClient, settingsQuery(client));
  },
  component: SettingsRoute,
});

export const page: PageRoute = {
  path: 'settings',
  namespace: 'settings',
  order: 90,
  route,
};
