import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext } from '@tanstack/react-router';

import type { GatewayClient } from '../api/gateway.js';
import { Layout } from '../app/layout.js';
import { NotFound, RouteError } from '../app/route-error.js';
import type { PageRoute } from './page-route.js';

/** What every route loader and component can read through `context`. */
export interface RouterContext {
  readonly queryClient: QueryClient;
  readonly client: GatewayClient;
  readonly pages: readonly PageRoute[];
}

function RootComponent(): React.JSX.Element {
  const { pages } = rootRoute.useRouteContext();
  return <Layout pages={pages} />;
}

/**
 * The app shell. Every page route is a child of it, so `getParentRoute: () =>
 * rootRoute` is how a page joins the tree.
 */
export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  errorComponent: RouteError,
  notFoundComponent: NotFound,
});
