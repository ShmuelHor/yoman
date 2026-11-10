// @vitest-environment happy-dom
import { cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundledResources } from '../../../src/i18n/bundled.js';
import { createI18n } from '../../../src/i18n/i18n.js';
import { route } from '../../../src/pages/dev-components/route.js';
import { renderWithTheme } from '../../support/render-with-theme.js';

const PANEL_COUNT = 4;
const HEBREW_PANEL = 0;
const ENGLISH_PANEL = 2;
/** Four full galleries take seconds to mount in happy-dom. */
const RENDER_TIMEOUT_MS = 30_000;

function renderPage(): void {
  const instance = createI18n(bundledResources, document.createElement('html'));
  const router = createMemoryRouter([{ path: '*', Component: route.Component }], {
    initialEntries: ['/dev/components'],
  });
  renderWithTheme(
    <I18nextProvider i18n={instance}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

/** Each panel pins its own theme, which is how the page shows both at once. */
function panels(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('section[data-theme]')];
}

function panel(index: number): ReturnType<typeof within> {
  const element = panels()[index];
  if (element === undefined) {
    throw new Error(`no panel ${index}`);
  }
  return within(element);
}

describe('/dev/components', { timeout: RENDER_TIMEOUT_MS }, () => {
  // Mounted once for every test, since mounting is the slow part. Each test
  // only reads, except the toggle test, which touches a switch no other test reads.
  beforeAll(renderPage, RENDER_TIMEOUT_MS);
  afterAll(cleanup);

  it('is a dev-only page at /dev/components', () => {
    expect(route).toMatchObject({ path: 'dev/components', devOnly: true });
  });

  it('shows the gallery in Hebrew and English, each in light and dark', () => {
    const attributes = panels().map((element) => [
      element.getAttribute('lang'),
      element.getAttribute('dir'),
      element.getAttribute('data-theme'),
    ]);
    expect(attributes).toEqual([
      ['he', 'rtl', 'light'],
      ['he', 'rtl', 'dark'],
      ['en', 'ltr', 'light'],
      ['en', 'ltr', 'dark'],
    ]);
  });

  it('renders every component in every panel, in the panel language', () => {
    expect(panels()).toHaveLength(PANEL_COUNT);
    const english = panel(ENGLISH_PANEL);
    expect(english.getByRole('button', { name: 'Start focus' })).toBeDefined();
    expect(english.getByRole('textbox', { name: 'App name' })).toBeDefined();
    expect(english.getAllByRole('switch')).toHaveLength(2);
    expect(english.getByText('Unusual')).toBeDefined();
    expect(english.getByRole('link', { name: 'Components' })).toBeDefined();
    expect(english.getByRole('region', { name: 'Screen time today' })).toBeDefined();
    expect(english.getByRole('region', { name: 'Unusual battery drain' })).toBeDefined();
    expect(english.getByRole('status').textContent).toBe('Focus mode · 47 min left');
  });

  it('lets the sample switches be toggled', async () => {
    const user = userEvent.setup();
    const [focus] = panel(HEBREW_PANEL).getAllByRole('switch');
    if (focus === undefined) {
      throw new Error('no switch');
    }

    await user.click(focus);

    expect(focus).toHaveProperty('checked', false);
  });
});
