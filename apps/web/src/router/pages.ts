import { collectPageRoutes, type PageRoute, servedPages } from './page-route.js';

/**
 * Developer tools live in `src/pages/dev-*` and set `devOnly`. They are loaded
 * lazily behind `import.meta.env.DEV`, so production builds drop the branch
 * and never emit their code or styles. `servedPages` then guarantees that no
 * dev-only route is served there even if one is placed elsewhere.
 */
const productPages = import.meta.glob(['../pages/*/route.tsx', '!../pages/dev-*/route.tsx'], {
  eager: true,
});

async function loadDevPages(): Promise<Record<string, unknown>> {
  const loaders = import.meta.glob('../pages/dev-*/route.tsx');
  const entries = await Promise.all(
    Object.entries(loaders).map(async ([file, load]) => [file, await load()] as const),
  );
  return Object.fromEntries(entries);
}

const devPages = import.meta.env.DEV ? await loadDevPages() : {};

/** Every page under `src/pages/<name>/route.tsx`, found at build time. */
export const pageRoutes: readonly PageRoute[] = servedPages(
  collectPageRoutes({ ...productPages, ...devPages }),
  import.meta.env.DEV,
);
