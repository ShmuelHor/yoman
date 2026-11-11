// @vitest-environment happy-dom

import { heIL as pickersHe } from '@mui/x-date-pickers/locales';
import { QueryClient } from '@tanstack/react-query';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GatewayClient } from '../../../src/api/gateway.js';
import { bundledResources } from '../../../src/i18n/bundled.js';
import { createI18n } from '../../../src/i18n/i18n.js';
import { page } from '../../../src/pages/dev-components/route.js';
import { renderRouter } from '../../support/render-router.js';

const PANEL_COUNT = 4;
const HEBREW_PANEL = 0;
const ENGLISH_PANEL = 2;
/** Four panels, each with a data grid and a date picker, take seconds to mount in happy-dom. */
const RENDER_TIMEOUT_MS = 30_000;

const instance = createI18n(bundledResources, document.createElement('html'));
/** MUI X's own Hebrew label for the button that opens a date picker. */
const HEBREW_CHOOSE_DATE =
  pickersHe.components.MuiLocalizationProvider.defaultProps.localeText.openDatePickerDialogue?.(
    null,
  ) ?? '';

async function renderPage(): Promise<void> {
  renderRouter({
    pages: [page],
    path: '/dev/components',
    queryClient: new QueryClient(),
    client: {} as GatewayClient,
    i18n: instance,
  });
  await screen.findByRole('heading', { level: 1 });
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
    expect(page).toMatchObject({ path: 'dev/components', devOnly: true });
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
    expect(english.getByRole('grid')).toBeDefined();
  });

  it('localizes the data grid and the date picker per panel', () => {
    expect(panel(ENGLISH_PANEL).getByRole('columnheader', { name: 'Minutes' })).toBeDefined();
    const hebrewMinutes = instance.t('dataGrid.minutes', { ns: 'dev-components', lng: 'he' });
    expect(panel(HEBREW_PANEL).getByRole('columnheader', { name: hebrewMinutes })).toBeDefined();
    expect(panel(ENGLISH_PANEL).getByRole('button', { name: /^Choose date/u })).toBeDefined();
    const [hebrewPicker] = panel(HEBREW_PANEL).getAllByRole('button', {
      name: (name: string): boolean =>
        HEBREW_CHOOSE_DATE !== '' && name.startsWith(HEBREW_CHOOSE_DATE),
    });
    expect(hebrewPicker).toBeDefined();
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
