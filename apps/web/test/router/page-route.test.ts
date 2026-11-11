import { createRootRoute, createRoute } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import {
  collectPageRoutes,
  hrefOf,
  navPages,
  type PageRoute,
  servedPages,
} from '../../src/router/page-route.js';

const FRACTIONAL = 1.5;
const root = createRootRoute();
const page = (path: string, order: number): { page: PageRoute } => ({
  page: {
    path,
    namespace: 'x',
    order,
    route: createRoute({ getParentRoute: () => root, path: path === '/' ? '/' : `/${path}` }),
  },
});

describe('collectPageRoutes', () => {
  it('returns the pages sorted by order', () => {
    const routes = collectPageRoutes({
      './pages/week/route.tsx': page('week', 2),
      './pages/today/route.tsx': page('/', 1),
    });

    expect(routes.map(({ path }) => path)).toEqual(['/', 'week']);
  });

  it('treats a page without devOnly as a regular page', () => {
    const [first] = collectPageRoutes({ './pages/week/route.tsx': page('week', 1) });

    expect(first?.devOnly).toBe(false);
  });

  it.each([
    ['no page export', {}],
    ['an absolute nested path', page('/week', 1)],
    ['a path with a parameter', page('apps/:id', 1)],
    ['a route that is not a TanStack route', { page: { ...page('a', 1).page, route: 'x' } }],
    ['a fractional order', page('a', FRACTIONAL)],
    ['a devOnly that is not a boolean', { page: { ...page('a', 1).page, devOnly: 'yes' } }],
  ])('fails on %s, naming the file', (_name, module) => {
    expect(() => collectPageRoutes({ './pages/bad/route.tsx': module })).toThrow(
      './pages/bad/route.tsx must export a valid `page`',
    );
  });

  it('fails when the route path differs from the page path', () => {
    const mismatch = { page: { ...page('week', 1).page, path: 'month' } };

    expect(() => collectPageRoutes({ './pages/month/route.tsx': mismatch })).toThrow(
      './pages/month/route.tsx: the route path must be /month',
    );
  });

  it.each([
    ['path', page('a', 1), page('a', 2)],
    ['order', page('a', 1), page('b', 1)],
  ])('fails when two pages share a %s', (key, first, second) => {
    expect(() => collectPageRoutes({ './one.tsx': first, './two.tsx': second })).toThrow(
      `./two.tsx and ./one.tsx share the ${key}`,
    );
  });
});

describe('hrefOf', () => {
  it.each([
    ['/', '/'],
    ['week', '/week'],
    ['focus/alerts', '/focus/alerts'],
  ])('links %s to %s', (path, href) => {
    expect(hrefOf(page(path, 1).page)).toBe(href);
  });
});

const regular = page('week', 1).page;
const devTool: PageRoute = { ...page('dev/components', 2).page, devOnly: true };

describe('servedPages', () => {
  it('serves dev-only pages in a dev build', () => {
    expect(servedPages([regular, devTool], true)).toEqual([regular, devTool]);
  });

  it('drops dev-only pages from a production build', () => {
    expect(servedPages([regular, devTool], false)).toEqual([regular]);
  });
});

describe('navPages', () => {
  it('never links dev-only pages from the navigation', () => {
    expect(navPages([regular, devTool])).toEqual([regular]);
  });
});
