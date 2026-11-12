// @vitest-environment happy-dom

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { settingsFixture } from '@yoman/shared/fixtures/data';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GatewayClient } from '../../src/api/gateway.js';
import { ApplySavedSettings } from '../../src/app/apply-saved-settings.js';
import { createQueryClient } from '../../src/app/query-client.js';
import { bundledResources } from '../../src/i18n/bundled.js';
import { createI18n } from '../../src/i18n/i18n.js';
import { ThemeProvider } from '../../src/theme/theme-provider.js';
import { fakeNotifier } from '../support/fake-notifier.js';

function mount(client: GatewayClient): { i18n: ReturnType<typeof createI18n>; root: HTMLElement } {
  const root = document.createElement('html');
  const i18n = createI18n(bundledResources, root);
  void i18n.changeLanguage('en');
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={createQueryClient(fakeNotifier())}>
        <ThemeProvider root={root}>
          <ApplySavedSettings client={client} />
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { i18n, root };
}

afterEach(cleanup);

describe('ApplySavedSettings', () => {
  it('applies the saved language and theme', async () => {
    const saved = { ...settingsFixture, language: 'he', theme: 'dark' };
    const client = { request: vi.fn(() => Promise.resolve(saved)) } as unknown as GatewayClient;
    const { i18n, root } = mount(client);

    await waitFor(() => expect(i18n.resolvedLanguage).toBe('he'));
    await waitFor(() => expect(root.getAttribute('data-theme')).toBe('dark'));
  });

  it('keeps the defaults when the gateway is down', async () => {
    const client = {
      request: vi.fn(() => Promise.reject(new Error('down'))),
    } as unknown as GatewayClient;
    const { i18n } = mount(client);

    await waitFor(() => expect(client.request).toHaveBeenCalled());
    expect(i18n.resolvedLanguage).toBe('en');
  });
});
