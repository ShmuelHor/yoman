import type { EnsureQueryDataOptions, QueryClient } from '@tanstack/react-query';

/**
 * Starts a query from a route loader so the request is in flight before the
 * page renders. It never blocks the navigation and never throws: the page's
 * own `useQuery` shows the loading and error states, and the query cache
 * already raises the toast. Data already in the cache is reused as is.
 */
export function prefetch<TData, TKey extends readonly unknown[]>(
  queryClient: QueryClient,
  options: EnsureQueryDataOptions<TData, Error, TData, TKey>,
): void {
  queryClient.ensureQueryData(options).catch(() => undefined);
}
