import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';

import type { RouteOutput } from '../../api/client.js';
import type { GatewayClient, GatewayRoutes } from '../../api/gateway.js';

type Output<N extends keyof GatewayRoutes> = RouteOutput<GatewayRoutes[N]>;

/**
 * Query definitions for the Today page. Pages copy this shape: one options
 * factory per gateway route, keyed by route name, so a mock client is all a
 * test needs and the cache keys stay in one place.
 */
export function todayQuery(
  client: GatewayClient,
): UseQueryOptions<Output<'dashboardToday'>, Error, Output<'dashboardToday'>, string[]> {
  return queryOptions({
    queryKey: ['dashboardToday'],
    queryFn: ({ signal }) => client.request('dashboardToday', undefined, signal),
  });
}

/** App names for the top-apps list. Names are untrusted: render them as text only. */
export function appsQuery(
  client: GatewayClient,
): UseQueryOptions<Output<'listApps'>, Error, Output<'listApps'>, string[]> {
  return queryOptions({
    queryKey: ['listApps'],
    queryFn: ({ signal }) => client.request('listApps', undefined, signal),
  });
}
