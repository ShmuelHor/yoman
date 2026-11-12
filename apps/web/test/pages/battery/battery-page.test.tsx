// @vitest-environment happy-dom

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { responseFixtures } from '@yoman/shared/fixtures/responses';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GatewayClient } from '../../../src/api/gateway.js';
import { createQueryClient } from '../../../src/app/query-client.js';
import { bundledResources } from '../../../src/i18n/bundled.js';
import { createI18n } from '../../../src/i18n/i18n.js';
import { BatteryPage } from '../../../src/pages/battery/battery-page.js';
import { fakeNotifier } from '../../support/fake-notifier.js';
import { renderWithTheme } from '../../support/render-with-theme.js';

const NOW = new Date('2026-11-08T12:00:00');
const DAYS = 30;
const WEEK = 7;

function clientAnswering(overrides: Record<string, unknown> = {}): {
  client: GatewayClient;
  request: ReturnType<typeof vi.fn>;
} {
  const answers: Record<string, unknown> = {
    batteryNow: structuredClone(responseFixtures.batteryNow),
    batteryHealthTrend: structuredClone(responseFixtures.batteryHealthTrend),
    batteryPowerByApp: structuredClone(responseFixtures.batteryPowerByApp),
    listApps: structuredClone(responseFixtures.listApps),
    ...overrides,
  };
  const request = vi.fn((name: string) => {
    const answer = answers[name];
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  });
  return { client: { request } as unknown as GatewayClient, request };
}

function renderPage(
  client: GatewayClient,
  onDaysChange: (days: number) => void = () => undefined,
  language = 'en',
): void {
  const i18n = createI18n(bundledResources, document.createElement('html'));
  void i18n.changeLanguage(language);
  renderWithTheme(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={createQueryClient(fakeNotifier())}>
        <BatteryPage client={client} days={DAYS} onDaysChange={onDaysChange} now={NOW} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

afterEach(cleanup);

describe('Battery page', () => {
  it('shows skeletons while the requests are pending', () => {
    renderPage({ request: () => new Promise(() => undefined) } as unknown as GatewayClient);

    expect(document.querySelector('[aria-busy]')).not.toBeNull();
  });

  it('shows the charge, the time remaining, the draw and the health', async () => {
    const { client } = clientAnswering();
    renderPage(client);

    expect(await screen.findByText('64%')).toBeTruthy();
    expect(screen.getByText('3h 35m')).toBeTruthy();
    expect(screen.getByText('8.2 W')).toBeTruthy();
    expect(screen.getByText('86.4%')).toBeTruthy();
  });

  it('asks for the chosen number of days', async () => {
    const { client, request } = clientAnswering();
    renderPage(client);

    await screen.findByText('64%');

    expect(request).toHaveBeenCalledWith(
      'batteryHealthTrend',
      { query: { days: DAYS } },
      expect.anything(),
    );
  });

  it('lists the apps by their name, with their average draw', async () => {
    const { client } = clientAnswering();
    renderPage(client);

    const grid = await screen.findByRole('grid', { name: 'What is draining your battery' });
    const firstApp = responseFixtures.batteryPowerByApp.items[0];
    const name = responseFixtures.listApps.items.find((app) => app.id === firstApp?.appId)?.name;

    expect(within(grid).getByText(name ?? '')).toBeTruthy();
    expect(within(grid).getByText('11.3 W')).toBeTruthy();
  });

  it('explains that the time remaining needs data, instead of a number', async () => {
    const { client } = clientAnswering({
      batteryNow: { ...responseFixtures.batteryNow, minutesRemaining: null, status: 'charging' },
    });
    renderPage(client);

    expect(await screen.findByText('Needs some time on battery to estimate.')).toBeTruthy();
  });

  it('shows empty states on a fresh install', async () => {
    const { client } = clientAnswering({
      batteryHealthTrend: { items: [] },
      batteryPowerByApp: { items: [] },
    });
    renderPage(client);

    expect(await screen.findByText(/No history yet/u)).toBeTruthy();
    expect(await screen.findByText('No data in this range yet.')).toBeTruthy();
  });

  it('says so on a device without a battery, and shows no charts', async () => {
    const { client } = clientAnswering({ batteryNow: null });
    renderPage(client);

    expect(await screen.findByText(/no battery/u)).toBeTruthy();
    expect(screen.queryByText('Health over time')).toBeNull();
  });

  it('keeps the page when only the drain table fails', async () => {
    const { client } = clientAnswering({ batteryPowerByApp: new Error('down') });
    renderPage(client);

    expect(await screen.findByText('64%')).toBeTruthy();
    expect(
      await screen.findByText('Power use by app could not be loaded.', {}, { timeout: 5000 }),
    ).toBeTruthy();
  });

  it('reports a range the user picks', async () => {
    const { client } = clientAnswering();
    const onDaysChange = vi.fn();
    renderPage(client, onDaysChange);

    await userEvent.click(await screen.findByRole('button', { name: '7 days' }));

    expect(onDaysChange).toHaveBeenCalledWith(WEEK);
  });

  it('renders in Hebrew', async () => {
    const { client } = clientAnswering();
    renderPage(client, undefined, 'he');

    const title = Reflect.get(Reflect.get(bundledResources.he, 'battery'), 'title');

    expect(typeof title).toBe('string');
    expect(await screen.findByRole('heading', { name: String(title) })).toBeTruthy();
  });
});
