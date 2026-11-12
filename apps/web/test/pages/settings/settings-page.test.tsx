// @vitest-environment happy-dom

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { settingsFixture } from '@yoman/shared/fixtures/data';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GatewayClient } from '../../../src/api/gateway.js';
import { createQueryClient } from '../../../src/app/query-client.js';
import { bundledResources } from '../../../src/i18n/bundled.js';
import { createI18n } from '../../../src/i18n/i18n.js';
import { SettingsPage } from '../../../src/pages/settings/settings-page.js';
import { fakeNotifier } from '../../support/fake-notifier.js';
import { renderWithTheme } from '../../support/render-with-theme.js';

/** The app's query client retries a failed read once, after a backoff. */
const RETRY_TIMEOUT_MS = 5000;
const ERROR_TEST_TIMEOUT_MS = 10_000;

function clientAnswering(answer: unknown = settingsFixture): {
  client: GatewayClient;
  request: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn((name: string, input?: { body?: unknown }) =>
    name === 'updateSettings'
      ? Promise.resolve(input?.body)
      : Promise.resolve(structuredClone(answer)),
  );
  return { client: { request } as unknown as GatewayClient, request };
}

function renderPage(client: GatewayClient): {
  notifier: ReturnType<typeof fakeNotifier>;
  i18n: ReturnType<typeof createI18n>;
} {
  const notifier = fakeNotifier();
  const i18n = createI18n(bundledResources, document.createElement('html'));
  void i18n.changeLanguage('en');
  renderWithTheme(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={createQueryClient(notifier)}>
        <SettingsPage client={client} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { notifier, i18n };
}

afterEach(cleanup);

describe('Settings page', () => {
  it('shows a skeleton while the settings load', () => {
    renderPage({ request: () => new Promise(() => undefined) } as unknown as GatewayClient);

    expect(document.querySelector('[aria-busy]')).not.toBeNull();
  });

  it('shows the saved settings', async () => {
    renderPage(clientAnswering().client);

    expect(await screen.findByLabelText('Language')).toHaveProperty('value', 'he');
    expect(screen.getByLabelText('Apps that are never tracked')).toHaveProperty(
      'value',
      'keepassxc',
    );
    expect(screen.getByLabelText('CPU pressure (%)')).toHaveProperty('value', '40');
    expect(screen.getByRole('switch', { name: 'Quiet hours' })).toHaveProperty('checked', true);
  });

  it(
    'shows an error when the settings cannot be loaded',
    async () => {
      renderPage({ request: () => Promise.reject(new Error('down')) } as unknown as GatewayClient);

      expect(
        await screen.findByText('Settings could not be loaded.', {}, { timeout: RETRY_TIMEOUT_MS }),
      ).toBeTruthy();
    },
    ERROR_TEST_TIMEOUT_MS,
  );

  it('applies the language at once and saves every setting', async () => {
    const user = userEvent.setup();
    const { client, request } = clientAnswering();
    const { notifier, i18n } = renderPage(client);

    await user.selectOptions(await screen.findByLabelText('Language'), 'en');
    expect(i18n.resolvedLanguage).toBe('en');
    await user.selectOptions(screen.getByLabelText('Color theme'), 'dark');
    await user.clear(screen.getByLabelText('CPU pressure (%)'));
    await user.type(screen.getByLabelText('CPU pressure (%)'), '55');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('updateSettings', {
        body: {
          ...settingsFixture,
          language: 'en',
          theme: 'dark',
          thresholds: { ...settingsFixture.thresholds, cpu: 55 },
        },
      }),
    );
    await waitFor(() => expect(notifier.success).toHaveBeenCalledWith('settings:toast.saved'));
  });

  it('does not save an invalid threshold', async () => {
    const user = userEvent.setup();
    const { client, request } = clientAnswering();
    renderPage(client);

    await user.clear(await screen.findByLabelText('CPU pressure (%)'));
    await user.type(screen.getByLabelText('CPU pressure (%)'), '150');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findAllByText('Enter a number from 0 to 100.')).toHaveLength(1);
    expect(request).not.toHaveBeenCalledWith('updateSettings', expect.anything());
  });
});
