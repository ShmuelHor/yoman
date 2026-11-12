import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';

import type { RouteOutput } from '../../api/client.js';
import type { GatewayClient, GatewayRoutes } from '../../api/gateway.js';

type Output<N extends keyof GatewayRoutes> = RouteOutput<GatewayRoutes[N]>;

/** The user's settings, as the gateway stores them. */
export function settingsQuery(
  client: GatewayClient,
): UseQueryOptions<Output<'getSettings'>, Error, Output<'getSettings'>, string[]> {
  return queryOptions({
    queryKey: ['getSettings'],
    queryFn: ({ signal }) => client.request('getSettings', undefined, signal),
  });
}
