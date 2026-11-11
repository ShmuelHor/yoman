import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';
import { format } from 'date-fns';

import type { RouteOutput } from '../../api/client.js';
import type { GatewayClient, GatewayRoutes } from '../../api/gateway.js';

type Output<N extends keyof GatewayRoutes> = RouteOutput<GatewayRoutes[N]>;

/** The goals the user has set. */
export function goalsQuery(
  client: GatewayClient,
): UseQueryOptions<Output<'listGoals'>, Error, Output<'listGoals'>, string[]> {
  return queryOptions({
    queryKey: ['listGoals'],
    queryFn: ({ signal }) => client.request('listGoals', undefined, signal),
  });
}

/** The local calendar day as `YYYY-MM-DD`, the format of the `date` the gateway expects. */
export function localDate(now: Date): string {
  return format(now, 'yyyy-MM-dd');
}

/** How each goal stands on `date`. A goal that is not scheduled that day has no item. */
export function goalProgressQuery(
  client: GatewayClient,
  date: string,
): UseQueryOptions<Output<'goalProgress'>, Error, Output<'goalProgress'>, string[]> {
  return queryOptions({
    queryKey: ['goalProgress', date],
    queryFn: ({ signal }) => client.request('goalProgress', { query: { date } }, signal),
  });
}

/** App names, for choosing an app as a goal's target. Names are untrusted: render them as text only. */
export function appsQuery(
  client: GatewayClient,
): UseQueryOptions<Output<'listApps'>, Error, Output<'listApps'>, string[]> {
  return queryOptions({
    queryKey: ['listApps'],
    queryFn: ({ signal }) => client.request('listApps', undefined, signal),
  });
}
