import { QueryClient } from '@tanstack/react-query';

const STALE_MS = 30_000;

/**
 * One client for the app. Data is local and cheap to refetch, so a short
 * stale time keeps pages fresh, and a failed request is retried once.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: STALE_MS, retry: 1, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}
