import { createRoute } from '@tanstack/react-router';

import type { PageRoute } from '../../router/page-route.js';
import { prefetch } from '../../router/prefetch.js';
import { rootRoute } from '../../router/root-route.js';
import { BatteryPage } from './battery-page.js';
import {
  appsQuery,
  batteryNowQuery,
  healthTrendQuery,
  powerByAppQuery,
  rangeOfDays,
} from './queries.js';
import { BatterySearch } from './search.js';

function BatteryRoute(): React.JSX.Element {
  const { client } = route.useRouteContext();
  const { days } = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <BatteryPage
      client={client}
      days={days}
      onDaysChange={(next): void => {
        void navigate({ search: { days: next } });
      }}
    />
  );
}

const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/battery',
  validateSearch: BatterySearch,
  loaderDeps: ({ search }) => ({ days: search.days }),
  loader: ({ context: { queryClient, client }, deps: { days } }): void => {
    prefetch(queryClient, batteryNowQuery(client));
    prefetch(queryClient, healthTrendQuery(client, days));
    prefetch(queryClient, powerByAppQuery(client, rangeOfDays(days, new Date())));
    prefetch(queryClient, appsQuery(client));
  },
  component: BatteryRoute,
});

export const page: PageRoute = {
  path: 'battery',
  namespace: 'battery',
  order: 30,
  route,
};
