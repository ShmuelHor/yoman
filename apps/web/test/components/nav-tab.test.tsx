// @vitest-environment happy-dom
import { cleanup, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
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

function renderAt(path: string): void {
  const router = createMemoryRouter([{ path: '*', Component: Tabs }], {
    initialEntries: [path],
  });
  renderWithTheme(<RouterProvider router={router} />);
}

describe('NavTab', () => {
  afterEach(cleanup);

  it('is a link to its page', () => {
    renderAt('/');

    expect(screen.getByRole('link', { name: 'Week' }).getAttribute('href')).toBe('/week');
  });

  it('marks only the tab of the current page as current', () => {
    renderAt('/week');

    expect(screen.getByRole('link', { name: 'Week' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('aria-current')).toBeNull();
  });
});
