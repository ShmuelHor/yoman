import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';

import type { RouteOutput } from '../../api/client.js';
import type { GatewayClient, GatewayRoutes } from '../../api/gateway.js';

type Output<N extends keyof GatewayRoutes> = RouteOutput<GatewayRoutes[N]>;

/** How often focus state is re-read, so the time left and an ending session stay current. */
const FOCUS_STATE_REFETCH_MS = 30_000;

/** Whether focus is on, and for how long. */
export function focusStateQuery(
  client: GatewayClient,
): UseQueryOptions<Output<'focusState'>, Error, Output<'focusState'>, string[]> {
  return queryOptions({
    queryKey: ['focusState'],
    queryFn: ({ signal }) => client.request('focusState', undefined, signal),
    refetchInterval: FOCUS_STATE_REFETCH_MS,
  });
}

/** The focus profiles. Their app ids come from the desktop: render them as text only. */
export function profilesQuery(
  client: GatewayClient,
): UseQueryOptions<Output<'listProfiles'>, Error, Output<'listProfiles'>, string[]> {
  return queryOptions({
    queryKey: ['listProfiles'],
    queryFn: ({ signal }) => client.request('listProfiles', undefined, signal),
  });
}

/** The apps the agent discovered on the desktop, for choosing what a profile mutes. */
export function knownAppsQuery(
  client: GatewayClient,
): UseQueryOptions<Output<'listKnownApps'>, Error, Output<'listKnownApps'>, string[]> {
  return queryOptions({
    queryKey: ['listKnownApps'],
    queryFn: ({ signal }) => client.request('listKnownApps', undefined, signal),
  });
}

/** The alerts held back while focus was on. */
export function alertQueueQuery(
  client: GatewayClient,
): UseQueryOptions<Output<'focusQueue'>, Error, Output<'focusQueue'>, string[]> {
  return queryOptions({
    queryKey: ['focusQueue'],
    queryFn: ({ signal }) => client.request('focusQueue', undefined, signal),
  });
}

/** The alert levels the user changed from the defaults. */
export function alertPolicyQuery(
  client: GatewayClient,
): UseQueryOptions<Output<'getAlertPolicy'>, Error, Output<'getAlertPolicy'>, string[]> {
  return queryOptions({
    queryKey: ['getAlertPolicy'],
    queryFn: ({ signal }) => client.request('getAlertPolicy', undefined, signal),
  });
}
