import { createRoute } from '@tanstack/react-router';

import type { PageRoute } from '../../router/page-route.js';
import { prefetch } from '../../router/prefetch.js';
import { rootRoute } from '../../router/root-route.js';
import {
  culpritsQuery,
  incidentsQuery,
  rangeOfDays,
  settingsQuery,
  timelineQuery,
} from './queries.js';
import { SystemSearch } from './search.js';
import { SystemPage } from './system-page.js';

function SystemRoute(): React.JSX.Element {
  const { client } = route.useRouteContext();
  const { date, days } = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <SystemPage
      client={client}
      date={date}
      days={days}
      onDateChange={(next): void => {
        void navigate({ search: (previous: SystemSearch) => ({ ...previous, date: next }) });
      }}
      onDaysChange={(next): void => {
        void navigate({ search: (previous: SystemSearch) => ({ ...previous, days: next }) });
      }}
    />
  );
}

const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/system',
  validateSearch: SystemSearch,
  loaderDeps: ({ search }) => ({ date: search.date, days: search.days }),
  loader: ({ context: { queryClient, client }, deps: { date, days } }): void => {
    prefetch(queryClient, timelineQuery(client, date));
    prefetch(queryClient, incidentsQuery(client, rangeOfDays(days, new Date())));
    prefetch(queryClient, culpritsQuery(client, days));
    prefetch(queryClient, settingsQuery(client));
  },
  component: SystemRoute,
});

export const page: PageRoute = {
  path: 'system',
  namespace: 'system',
  order: 40,
  route,
};
