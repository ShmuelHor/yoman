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
import { SystemPage } from '../../../src/pages/system/system-page.js';
import { fakeNotifier } from '../../support/fake-notifier.js';
import { renderWithTheme } from '../../support/render-with-theme.js';

/** Data grids and charts are slow to mount in happy-dom, more so when the suite runs in parallel. */
const RENDER_TIMEOUT_MS = 30_000;
const RETRY_TIMEOUT_MS = 5000;
const NOW = new Date('2026-11-08T12:00:00');
const DATE = '2026-11-08';
const DAYS = 30;
const WEEK = 7;

function clientAnswering(overrides: Record<string, unknown> = {}): {
  client: GatewayClient;
  request: ReturnType<typeof vi.fn>;
} {
  const answers: Record<string, unknown> = {
    systemTimeline: structuredClone(responseFixtures.systemTimeline),
    systemIncidents: structuredClone(responseFixtures.systemIncidents),
    systemCulprits: structuredClone(responseFixtures.systemCulprits),
    getSettings: structuredClone(responseFixtures.getSettings),
    ...overrides,
  };
  const request = vi.fn((name: string) => {
    const answer = answers[name];
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  });
  return { client: { request } as unknown as GatewayClient, request };
}

interface Handlers {
  readonly onDateChange?: (date: string) => void;
  readonly onDaysChange?: (days: number) => void;
  readonly date?: string;
}

function renderPage(client: GatewayClient, handlers: Handlers = {}, language = 'en'): void {
  const i18n = createI18n(bundledResources, document.createElement('html'));
  void i18n.changeLanguage(language);
  renderWithTheme(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={createQueryClient(fakeNotifier())}>
        <SystemPage
          client={client}
          date={handlers.date ?? DATE}
          days={DAYS}
          onDateChange={handlers.onDateChange ?? ((): void => undefined)}
          onDaysChange={handlers.onDaysChange ?? ((): void => undefined)}
          now={NOW}
        />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

afterEach(cleanup);

describe('System page', { timeout: RENDER_TIMEOUT_MS }, () => {
  it('shows skeletons while the requests are pending', () => {
    renderPage({ request: () => new Promise(() => undefined) } as unknown as GatewayClient);

    expect(document.querySelector('[aria-busy]')).not.toBeNull();
  });

  it('asks for the chosen day and range', async () => {
    const { client, request } = clientAnswering();
    renderPage(client);

    await screen.findByRole('grid', { name: 'Incident history' });

    expect(request).toHaveBeenCalledWith(
      'systemTimeline',
      { query: { date: DATE } },
      expect.anything(),
    );
    expect(request).toHaveBeenCalledWith(
      'systemCulprits',
      { query: { days: DAYS } },
      expect.anything(),
    );
  });

  it('lists incidents with their type, peak and heaviest process', async () => {
    const { client } = clientAnswering();
    renderPage(client);

    const grid = await screen.findByRole('grid', { name: 'Incident history' });

    expect(within(grid).getByText('Memory pressure')).toBeTruthy();
    expect(within(grid).getByText('27.5%')).toBeTruthy();
    expect(within(grid).getByText('node')).toBeTruthy();
  });

  it('marks an incident that is still open', async () => {
    const [incident] = responseFixtures.systemIncidents.items;
    const { client } = clientAnswering({
      systemIncidents: { items: [{ ...incident, end: null }] },
    });
    renderPage(client);

    expect(await screen.findByText('Ongoing')).toBeTruthy();
  });

  it('lists recurring culprits with their container and count', async () => {
    const { client } = clientAnswering();
    renderPage(client);

    const grid = await screen.findByRole('grid', { name: 'Recurring culprits' });

    expect(within(grid).getByText('yoman-web-1')).toBeTruthy();
    expect(within(grid).getByText('3')).toBeTruthy();
  });

  it('shows the thresholds from the settings', async () => {
    const { client } = clientAnswering();
    renderPage(client);

    expect(await screen.findByText('40%')).toBeTruthy();
    expect(screen.getByText('30%')).toBeTruthy();
    expect(screen.getByText('10%')).toBeTruthy();
  });

  it('shows empty states on a fresh install', async () => {
    const { client } = clientAnswering({
      systemTimeline: { date: DATE, points: [], incidents: [] },
      systemIncidents: { items: [] },
      systemCulprits: { items: [] },
    });
    renderPage(client);

    expect(await screen.findByText('No load data for this day yet.')).toBeTruthy();
    expect(await screen.findByText(/No incidents in this range/u)).toBeTruthy();
    expect(await screen.findByText('No repeat offenders in this range.')).toBeTruthy();
  });

  it('keeps the page when only the settings fail', async () => {
    const { client } = clientAnswering({ getSettings: new Error('down') });
    renderPage(client);

    expect(await screen.findByRole('grid', { name: 'Incident history' })).toBeTruthy();
    expect(
      await screen.findByText(
        'The thresholds could not be loaded.',
        {},
        { timeout: RETRY_TIMEOUT_MS },
      ),
    ).toBeTruthy();
  });

  it('reports a range the user picks', async () => {
    const { client } = clientAnswering();
    const onDaysChange = vi.fn();
    renderPage(client, { onDaysChange });

    await userEvent.click(await screen.findByRole('button', { name: '7 days' }));

    expect(onDaysChange).toHaveBeenCalledWith(WEEK);
  });

  it('steps the chart to the previous day', async () => {
    const { client } = clientAnswering();
    const onDateChange = vi.fn();
    renderPage(client, { onDateChange });

    await userEvent.click(await screen.findByRole('button', { name: 'Previous day' }));

    expect(onDateChange).toHaveBeenCalledWith('2026-11-07');
  });

  it('does not step past today', async () => {
    const { client } = clientAnswering();
    renderPage(client);

    const next = await screen.findByRole('button', { name: 'Next day' });

    expect((next as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders in Hebrew', async () => {
    const { client } = clientAnswering();
    renderPage(client, {}, 'he');

    const title = Reflect.get(Reflect.get(bundledResources.he, 'system'), 'title');

    expect(await screen.findByRole('heading', { name: String(title) })).toBeTruthy();
  });
});
