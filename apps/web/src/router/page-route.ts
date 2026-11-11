import type { AnyRoute } from '@tanstack/react-router';
import { z } from 'zod';

/**
 * What every `pages/<name>/route.tsx` exports as `page`. Pages register
 * themselves this way, so adding a page never edits a shared file.
 *
 * The page pattern (copy `pages/today`):
 * 1. Create the TanStack route in the page's own file with
 *    `createRoute({ getParentRoute: () => rootRoute, path, component, ... })`.
 *    Params and search are typed per route there: declare search with a Zod
 *    schema in `validateSearch` (give every field a default or `.catch`, so a
 *    hand-edited URL never breaks the page) and read it with `route.useSearch()`.
 * 2. Start the page's data in `loader`: `prefetch(context.queryClient,
 *    someQuery(context.client))` with the page's query-options factories. The
 *    page still renders its states with `useQuery`.
 * 3. Export `page: PageRoute` with the route and its registry metadata.
 */
export interface PageRoute {
  /** `/` for the index page, otherwise a relative segment such as `week`. */
  readonly path: string;
  /** The page's i18n namespace; its `title` key labels the nav link. */
  readonly namespace: string;
  /** Position in the navigation, lowest first. */
  readonly order: number;
  /**
   * A developer tool such as `/dev/components`: served by `vite dev` only, and
   * never linked from the navigation.
   */
  readonly devOnly?: boolean;
  /** The page's TanStack route, whose path is `hrefOf(page)`. */
  readonly route: AnyRoute;
}

function isRoute(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && 'options' in value && 'addChildren' in value
  );
}

const PageRouteSchema = z.object({
  path: z.string().regex(/^(\/|[a-z0-9-]+(\/[a-z0-9-]+)*)$/u),
  namespace: z.string().regex(/^[a-z][a-z0-9-]*$/u),
  order: z.number().int(),
  devOnly: z.boolean().default(false),
  route: z.custom<AnyRoute>(isRoute),
});

const RouteOptions = z.looseObject({ path: z.string().optional() });

/** The `path` the route was created with; its `path` property is only set once it joins a tree. */
function routePath(route: AnyRoute): string | undefined {
  return RouteOptions.parse(route.options).path;
}

const PageModule = z.object({ page: PageRouteSchema });

/**
 * Turns the glob of page modules into a route list sorted by `order`. A page
 * with a malformed export, a duplicate path or a duplicate order fails at
 * startup with its file name, rather than vanishing from the app.
 */
export function collectPageRoutes(modules: Readonly<Record<string, unknown>>): PageRoute[] {
  const pages = Object.entries(modules).map(([file, module]) => {
    const parsed = PageModule.safeParse(module);
    if (!parsed.success) {
      throw new Error(`${file} must export a valid \`page\`: ${parsed.error.message}`);
    }
    const { page } = parsed.data;
    if (routePath(page.route) !== hrefOf(page)) {
      throw new Error(`${file}: the route path must be ${hrefOf(page)}, as in \`page.path\``);
    }
    return { file, route: page };
  });
  assertUnique(pages, 'path');
  assertUnique(pages, 'order');
  return pages.map(({ route }) => route).sort((a, b) => a.order - b.order);
}

function assertUnique(
  pages: readonly { readonly file: string; readonly route: PageRoute }[],
  key: 'path' | 'order',
): void {
  const seen = new Map<unknown, string>();
  for (const { file, route } of pages) {
    const other = seen.get(route[key]);
    if (other !== undefined) {
      throw new Error(`${file} and ${other} share the ${key} ${String(route[key])}`);
    }
    seen.set(route[key], file);
  }
}

/** The `to` of a nav link for a page. */
export function hrefOf(route: PageRoute): string {
  return route.path === '/' ? '/' : `/${route.path}`;
}

/**
 * The pages a build serves. Production builds drop dev-only pages, so their
 * routes do not exist there at all.
 */
export function servedPages(pages: readonly PageRoute[], dev: boolean): PageRoute[] {
  return pages.filter((page) => dev || page.devOnly !== true);
}

/** The pages linked from the main navigation. Dev-only pages are reached by URL. */
export function navPages(pages: readonly PageRoute[]): PageRoute[] {
  return pages.filter((page) => page.devOnly !== true);
}
