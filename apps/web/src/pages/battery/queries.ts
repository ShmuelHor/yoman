import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';
import { addDays, startOfDay } from 'date-fns';

import type { RouteOutput } from '../../api/client.js';
import type { GatewayClient, GatewayRoutes } from '../../api/gateway.js';

type Output<N extends keyof GatewayRoutes> = RouteOutput<GatewayRoutes[N]>;

/** The battery's state right now; `null` on a device without a battery. */
export function batteryNowQuery(
  client: GatewayClient,
): UseQueryOptions<Output<'batteryNow'>, Error, Output<'batteryNow'>, string[]> {
  return queryOptions({
    queryKey: ['batteryNow'],
    queryFn: ({ signal }) => client.request('batteryNow', undefined, signal),
  });
}

/** One entry per day: health, cycle count and average draw. */
export function healthTrendQuery(
  client: GatewayClient,
  days: number,
): UseQueryOptions<
  Output<'batteryHealthTrend'>,
  Error,
  Output<'batteryHealthTrend'>,
  (string | number)[]
> {
  return queryOptions({
    queryKey: ['batteryHealthTrend', days],
    queryFn: ({ signal }) => client.request('batteryHealthTrend', { query: { days } }, signal),
  });
}

/** The `[from, to)` range of the last `days` local days, today included. */
export function rangeOfDays(days: number, now: Date): { from: string; to: string } {
  const today = startOfDay(now);
  return { from: addDays(today, 1 - days).toISOString(), to: addDays(today, 1).toISOString() };
}

/**
 * Average draw per app while it was in focus. The range is whole days, so the
 * query key stays the same all day instead of changing every render.
 */
export function powerByAppQuery(
  client: GatewayClient,
  range: { from: string; to: string },
): UseQueryOptions<Output<'batteryPowerByApp'>, Error, Output<'batteryPowerByApp'>, string[]> {
  return queryOptions({
    queryKey: ['batteryPowerByApp', range.from, range.to],
    queryFn: ({ signal }) => client.request('batteryPowerByApp', { query: range }, signal),
  });
}

/** App names for the drain table. Names are untrusted: render them as text only. */
export function appsQuery(
  client: GatewayClient,
): UseQueryOptions<Output<'listApps'>, Error, Output<'listApps'>, string[]> {
  return queryOptions({
    queryKey: ['listApps'],
    queryFn: ({ signal }) => client.request('listApps', undefined, signal),
  });
}
