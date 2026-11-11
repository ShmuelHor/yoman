import type { QueryClient } from '@tanstack/react-query';
import { type AnyRouter, createRouter, type RouterHistory } from '@tanstack/react-router';

import type { GatewayClient } from '../api/gateway.js';
import type { PageRoute } from './page-route.js';
import { rootRoute } from './root-route.js';

interface AppRouterOptions {
  readonly pages: readonly PageRoute[];
  readonly queryClient: QueryClient;
  readonly client: GatewayClient;
  /** Tests pass a memory history; the app uses the browser's. */
  readonly history?: RouterHistory;
}

/**
 * Builds the route tree from the registered pages, nested under the app shell.
 * The tree is assembled at runtime from the page registry, so it is not
 * registered with TanStack's global `Register`: each page gets full type safety
 * from its own route object instead (see `page-route.ts`).
 */
export function createAppRouter({
  pages,
  queryClient,
  client,
  history,
}: AppRouterOptions): AnyRouter {
  return createRouter({
    routeTree: rootRoute.addChildren(pages.map((page) => page.route)),
    context: { queryClient, client, pages },
    // TanStack Query is the cache, so the router never holds loader data of its own.
    defaultPreloadStaleTime: 0,
    defaultPreload: 'intent',
    ...(history === undefined ? {} : { history }),
  });
}

export type AppRouter = AnyRouter;
