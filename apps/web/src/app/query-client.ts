import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { ApiError } from '../api/client.js';
import { isDegraded, NOTIFY_KEYS, type Notifier } from '../notify/notifier.js';

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
 *
 * Toasts are raised here, once, for every query and mutation: a failure shows
 * an error toast, a mutation with `meta.successMessage` shows a success toast,
 * and a response that lists `degraded` services shows a warning. Plain reads
 * stay silent.
 */
export function createQueryClient(notifier: Notifier): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error): void => notifier.error(error),
      onSuccess: (data): void => {
        if (isDegraded(data)) {
          notifier.warning(NOTIFY_KEYS.degraded);
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error): void => notifier.error(error),
      onSuccess: (data, _variables, _onMutateResult, mutation): void => {
        if (isDegraded(data)) {
          notifier.warning(NOTIFY_KEYS.degraded);
        }
        const successMessage = mutation.meta?.successMessage;
        if (successMessage !== undefined) {
          notifier.success(successMessage);
        }
      },
    }),
    defaultOptions: {
      queries: { staleTime: STALE_MS, retry: shouldRetry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}
