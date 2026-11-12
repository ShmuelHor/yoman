import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';
import { addDays, startOfDay } from 'date-fns';

import type { RouteOutput } from '../../api/client.js';
import type { GatewayClient, GatewayRoutes } from '../../api/gateway.js';

type Output<N extends keyof GatewayRoutes> = RouteOutput<GatewayRoutes[N]>;

/** The pressure samples and incidents of one local day. */
export function timelineQuery(
  client: GatewayClient,
  date: string,
): UseQueryOptions<Output<'systemTimeline'>, Error, Output<'systemTimeline'>, string[]> {
  return queryOptions({
    queryKey: ['systemTimeline', date],
    queryFn: ({ signal }) => client.request('systemTimeline', { query: { date } }, signal),
  });
}

/** The `[from, to)` range of the last `days` local days, today included. */
export function rangeOfDays(days: number, now: Date): { from: string; to: string } {
  const today = startOfDay(now);
  return { from: addDays(today, 1 - days).toISOString(), to: addDays(today, 1).toISOString() };
}

/** Incidents in a range. The range is whole days, so the query key stays the same all day. */
export function incidentsQuery(
  client: GatewayClient,
  range: { from: string; to: string },
): UseQueryOptions<Output<'systemIncidents'>, Error, Output<'systemIncidents'>, string[]> {
  return queryOptions({
    queryKey: ['systemIncidents', range.from, range.to],
    queryFn: ({ signal }) => client.request('systemIncidents', { query: range }, signal),
  });
}

/** The processes that caused the most incidents over the last `days` days. */
export function culpritsQuery(
  client: GatewayClient,
  days: number,
): UseQueryOptions<Output<'systemCulprits'>, Error, Output<'systemCulprits'>, (string | number)[]> {
  return queryOptions({
    queryKey: ['systemCulprits', days],
    queryFn: ({ signal }) => client.request('systemCulprits', { query: { days } }, signal),
  });
}

/** Settings, for the thresholds that open an incident. */
export function settingsQuery(
  client: GatewayClient,
): UseQueryOptions<Output<'getSettings'>, Error, Output<'getSettings'>, string[]> {
  return queryOptions({
    queryKey: ['getSettings'],
    queryFn: ({ signal }) => client.request('getSettings', undefined, signal),
  });
}
