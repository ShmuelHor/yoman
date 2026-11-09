import { describe, expect, it } from 'vitest';

import {
  collectPageRoutes,
  hrefOf,
  navPages,
  type PageRoute,
  servedPages,
} from '../../src/router/page-route.js';

const Page = (): null => null;
const FRACTIONAL = 1.5;
const page = (path: string, order: number): { route: PageRoute } => ({
  route: { path, namespace: 'x', order, Component: Page },
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
    const [route] = collectPageRoutes({ './pages/week/route.tsx': page('week', 1) });

    expect(route?.devOnly).toBe(false);
  });

  it.each([
    ['no route export', {}],
    ['an absolute nested path', page('/week', 1)],
    ['a path with a parameter', page('apps/:id', 1)],
    ['a component that is not a function', { route: { ...page('a', 1).route, Component: 'x' } }],
    ['a fractional order', page('a', FRACTIONAL)],
    ['a devOnly that is not a boolean', { route: { ...page('a', 1).route, devOnly: 'yes' } }],
  ])('fails on %s, naming the file', (_name, module) => {
    expect(() => collectPageRoutes({ './pages/bad/route.tsx': module })).toThrow(
      './pages/bad/route.tsx must export a valid `route`',
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
    expect(hrefOf(page(path, 1).route)).toBe(href);
  });
});

const regular = page('week', 1).route;
const devTool: PageRoute = { ...page('dev/components', 2).route, devOnly: true };

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
