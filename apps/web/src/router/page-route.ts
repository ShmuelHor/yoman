import type { ComponentType } from 'react';
import { z } from 'zod';

/**
 * What every `pages/<name>/route.tsx` exports as `route`. Pages register
 * themselves this way, so adding a page never edits a shared file.
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
  readonly Component: ComponentType;
}

const PageRouteSchema = z.object({
  path: z.string().regex(/^(\/|[a-z0-9-]+(\/[a-z0-9-]+)*)$/u),
  namespace: z.string().regex(/^[a-z][a-z0-9-]*$/u),
  order: z.number().int(),
  devOnly: z.boolean().default(false),
  Component: z.custom<ComponentType>((value) => typeof value === 'function'),
});

const PageModule = z.object({ route: PageRouteSchema });

/**
 * Turns the glob of page modules into a route list sorted by `order`. A page
 * with a malformed export, a duplicate path or a duplicate order fails at
 * startup with its file name, rather than vanishing from the app.
 */
export function collectPageRoutes(modules: Readonly<Record<string, unknown>>): PageRoute[] {
  const pages = Object.entries(modules).map(([file, module]) => {
    const parsed = PageModule.safeParse(module);
    if (!parsed.success) {
      throw new Error(`${file} must export a valid \`route\`: ${parsed.error.message}`);
    }
    return { file, route: parsed.data.route };
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
