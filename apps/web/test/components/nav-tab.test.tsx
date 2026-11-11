// @vitest-environment happy-dom

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { NavTab } from '../../src/components/nav-tab.js';
import { renderWithTheme } from '../support/render-with-theme.js';

function Tabs(): React.JSX.Element {
  return (
    <nav>
      <NavTab to="/">Today</NavTab>
      <NavTab to="/week">Week</NavTab>
    </nav>
  );
}

async function renderAt(path: string): Promise<void> {
  const root = createRootRoute({ component: Tabs });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/' }),
      createRoute({ getParentRoute: () => root, path: '/week' }),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  renderWithTheme(<RouterProvider router={router} />);
  await screen.findByRole('navigation');
}

describe('NavTab', () => {
  afterEach(cleanup);

  it('is a link to its page', async () => {
    await renderAt('/');

    expect(screen.getByRole('link', { name: 'Week' }).getAttribute('href')).toBe('/week');
  });

  it('marks only the tab of the current page as current', async () => {
    await renderAt('/week');

    expect(screen.getByRole('link', { name: 'Week' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('aria-current')).toBeNull();
  });
});
