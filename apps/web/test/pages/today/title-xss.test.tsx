// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, screen } from '@testing-library/react';
import { responseFixtures } from '@yoman/shared/fixtures/responses';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GatewayClient } from '../../../src/api/gateway.js';
import { bundledResources } from '../../../src/i18n/bundled.js';
import { createI18n } from '../../../src/i18n/i18n.js';
import { TodayPage } from '../../../src/pages/today/today-page.js';
import { renderWithTheme } from '../../support/render-with-theme.js';

const PAYLOAD = '<img src=x onerror="window.__pwned = true">';

/** The gateway answers with the fixtures, except that the top app carries a hostile name. */
function hostileClient(): GatewayClient {
  const apps = structuredClone(responseFixtures.listApps);
  const first = apps.items[0];
  if (first === undefined) {
    throw new Error('the apps fixture is empty');
  }
  first.name = PAYLOAD;
  return {
    request: vi.fn((name: string) =>
      Promise.resolve(name === 'listApps' ? apps : responseFixtures.dashboardToday),
    ),
  } as unknown as GatewayClient;
}

afterEach(cleanup);

describe('ST13 window title XSS (web side)', () => {
  // The task names Playwright; it is not a dependency yet, so the same assertion runs in a DOM
  // environment: what matters is that the hostile string becomes a text node and never an element.
  it('a title like <img src=x onerror=...> renders as text', async () => {
    const i18n = createI18n(bundledResources, document.createElement('html'));
    renderWithTheme(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={new QueryClient()}>
          <TodayPage client={hostileClient()} />
        </QueryClientProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText(PAYLOAD)).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });
});
