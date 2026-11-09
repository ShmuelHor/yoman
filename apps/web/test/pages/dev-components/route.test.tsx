// @vitest-environment happy-dom
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { bundledResources } from '../../../src/i18n/bundled.js';
import { createI18n } from '../../../src/i18n/i18n.js';
import { route } from '../../../src/pages/dev-components/route.js';

const PANEL_COUNT = 4;

function renderPage(): void {
  const instance = createI18n(bundledResources, document.createElement('html'));
  const router = createMemoryRouter([{ path: '*', Component: route.Component }], {
    initialEntries: ['/dev/components'],
  });
  render(
    <I18nextProvider i18n={instance}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

/** Each panel pins its own theme, which is how the page shows both at once. */
function panels(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('section[data-theme]')];
}

describe('/dev/components', () => {
  afterEach(cleanup);

  it('is a dev-only page at /dev/components', () => {
    expect(route).toMatchObject({ path: 'dev/components', devOnly: true });
  });

  it('shows the gallery in Hebrew and English, each in light and dark', () => {
    renderPage();

    const attributes = panels().map((panel) => [
      panel.getAttribute('lang'),
      panel.getAttribute('dir'),
      panel.getAttribute('data-theme'),
    ]);
    expect(attributes).toEqual([
      ['he', 'rtl', 'light'],
      ['he', 'rtl', 'dark'],
      ['en', 'ltr', 'light'],
      ['en', 'ltr', 'dark'],
    ]);
  });

  it('renders every component in every panel, in the panel language', () => {
    renderPage();

    const all = panels();
    expect(all).toHaveLength(PANEL_COUNT);
    const english = all[2];
    if (english === undefined) {
      throw new Error('no English panel');
    }
    const panel = within(english);
    expect(panel.getByRole('button', { name: 'Start focus' })).toBeDefined();
    expect(panel.getByRole('textbox', { name: 'App name' })).toBeDefined();
    expect(panel.getAllByRole('switch')).toHaveLength(2);
    expect(panel.getByText('Unusual')).toBeDefined();
    expect(panel.getByRole('link', { name: 'Components' })).toBeDefined();
    expect(panel.getByRole('region', { name: 'Screen time today' })).toBeDefined();
    expect(panel.getByRole('region', { name: 'Unusual battery drain' })).toBeDefined();
    expect(panel.getByRole('status').textContent).toBe('Focus mode · 47 min left');
  });

  it('lets the sample switches be toggled', () => {
    renderPage();
    const [first] = panels();
    if (first === undefined) {
      throw new Error('no panel');
    }
    const [focus] = within(first).getAllByRole('switch');
    if (focus === undefined) {
      throw new Error('no switch');
    }

    fireEvent.click(focus);

    expect(focus.getAttribute('aria-checked')).toBe('false');
  });
});
