import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '../api/client.js';

const STALE_MS = 30_000;
const MAX_QUERY_RETRIES = 1;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;

/** The API client already re-opens the session on 401, so repeating it would only hammer the gateway. */
function shouldRetry(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && (error.status === UNAUTHORIZED || error.status === FORBIDDEN)) {
    return false;
  }
  return failureCount < MAX_QUERY_RETRIES;
}

/**
 * One client for the app. Data is local and cheap to refetch, so a short
 * stale time keeps pages fresh, and a failed request is retried once, except for auth failures.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: STALE_MS, retry: shouldRetry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}
