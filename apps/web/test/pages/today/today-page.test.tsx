// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GatewayClient } from '../../../src/api/gateway.js';
import { bundledResources } from '../../../src/i18n/bundled.js';
import { createI18n } from '../../../src/i18n/i18n.js';
import { TodayPage } from '../../../src/pages/today/today-page.js';
import { renderWithTheme } from '../../support/render-with-theme.js';
import { dashboardTodayFixture } from './fixtures.js';

type Answer = Record<string, unknown> | Error;

function clientAnswering(answers: Record<string, Answer>): GatewayClient {
  return {
    request: vi.fn((name: string) => {
      const answer = answers[name];
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    }),
  } as unknown as GatewayClient;
}

function renderPage(client: GatewayClient): void {
  const i18n = createI18n(bundledResources, document.createElement('html'));
  void i18n.changeLanguage('en');
  renderWithTheme(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <TodayPage client={client} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

afterEach(cleanup);

describe('Today page', () => {
  it('shows skeletons while the request is pending', () => {
    renderPage({ request: () => new Promise(() => undefined) } as unknown as GatewayClient);

    expect(document.querySelector('[aria-busy]')).not.toBeNull();
  });

  it('shows the active time, streak and battery from the dashboard', async () => {
    renderPage(clientAnswering(dashboardTodayFixture()));

    expect(await screen.findByText('4h 30m')).toBeTruthy();
    expect(screen.getByText('1h 30m')).toBeTruthy();
    expect(screen.getByText('64%')).toBeTruthy();
  });

  it('shows a note instead of a number for a degraded section', async () => {
    const answers = {
      ...dashboardTodayFixture(),
      dashboardToday: {
        data: { reports: null, battery: null, openIncidents: null, focus: null },
        degraded: ['reports', 'battery'],
      },
    };
    renderPage(clientAnswering(answers));

    expect(await screen.findByText(/Some data is unavailable/u)).toBeTruthy();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
  });

  it('shows an error when the gateway cannot be reached', async () => {
    renderPage(clientAnswering({ dashboardToday: new Error('down'), listApps: new Error('down') }));

    expect(await screen.findByText(/could not be loaded/u)).toBeTruthy();
  });
});
