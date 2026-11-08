import { collectPageRoutes, type PageRoute } from './page-route.js';

/** Every page under `src/pages/<name>/route.tsx`, found at build time. */
export const pageRoutes: readonly PageRoute[] = collectPageRoutes(
  import.meta.glob('../pages/*/route.tsx', { eager: true }),
);
