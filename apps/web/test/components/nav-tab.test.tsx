// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { NavTab } from '../../src/components/nav-tab.js';

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
  render(<RouterProvider router={router} />);
}

describe('NavTab', () => {
  afterEach(cleanup);

  it('marks only the tab of the current page as active', () => {
    renderAt('/week');

    const week = screen.getByRole('link', { name: 'Week' });
    const today = screen.getByRole('link', { name: 'Today' });
    expect(week.getAttribute('aria-current')).toBe('page');
    expect(week.className).toContain('nav-tab--active');
    expect(today.getAttribute('aria-current')).toBeNull();
    expect(today.className).not.toContain('nav-tab--active');
  });
});
