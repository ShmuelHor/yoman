import { createBrowserRouter, type RouteObject } from 'react-router';

import { Layout } from '../app/layout.js';
import { RouteError } from '../app/route-error.js';
import type { PageRoute } from './page-route.js';

/** Route objects for the registered pages, nested under the app shell. */
export function buildRoutes(pages: readonly PageRoute[]): RouteObject[] {
  const children: RouteObject[] = pages.map(({ path, Component }) =>
    path === '/' ? { index: true, Component } : { path, Component },
  );
  return [
    {
      path: '/',
      element: <Layout pages={pages} />,
      errorElement: <RouteError />,
      children,
    },
  ];
}

export function createAppRouter(
  pages: readonly PageRoute[],
): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(buildRoutes(pages));
}
