import { collectPageRoutes, type PageRoute, servedPages } from './page-route.js';

/**
 * Every page under `src/pages/<name>/route.tsx`, found at build time. Dev-only
 * pages are kept out of production builds.
 */
export const pageRoutes: readonly PageRoute[] = servedPages(
  collectPageRoutes(import.meta.glob('../pages/*/route.tsx', { eager: true })),
  import.meta.env.DEV,
);
