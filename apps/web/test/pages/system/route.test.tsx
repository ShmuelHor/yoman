// @vitest-environment happy-dom

import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { responseFixtures } from '@yoman/shared/fixtures/responses';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GatewayClient } from '../../../src/api/gateway.js';
import { createQueryClient } from '../../../src/app/query-client.js';
import { bundledResources } from '../../../src/i18n/bundled.js';
import { createI18n } from '../../../src/i18n/i18n.js';
import { page } from '../../../src/pages/system/route.js';
import { fakeNotifier } from '../../support/fake-notifier.js';
import { renderRouter } from '../../support/render-router.js';

/** Rendering the whole shell with data grids is slow in happy-dom, more so when the suite runs in parallel. */
const RENDER_TIMEOUT_MS = 30_000;
const LOOKUP_TIMEOUT_MS = 10_000;
const WEEK = 7;
const MONTH = 30;

function mockClient(): { client: GatewayClient; request: ReturnType<typeof vi.fn> } {
  const request = vi.fn((name: string) =>
    Promise.resolve(structuredClone(Reflect.get(responseFixtures, name))),
  );
  return { client: { request } as unknown as GatewayClient, request };
}

function renderAt(path: string, client: GatewayClient): void {
  const i18n = createI18n(bundledResources, document.createElement('html'));
  void i18n.changeLanguage('en');
  renderRouter({
    pages: [page],
    path,
    queryClient: createQueryClient(fakeNotifier()),
    client,
    i18n,
  });
}

afterEach(cleanup);

describe('/system route', { timeout: RENDER_TIMEOUT_MS }, () => {
  it('registers as a navigation page', () => {
    expect(page).toMatchObject({ path: 'system', namespace: 'system' });
  });

  it('loads the day and the range from the URL', async () => {
    const { client, request } = mockClient();
    renderAt(`/system?date=2026-11-03&days=${WEEK}`, client);

    await screen.findByRole('heading', { level: 1 });

    expect(request).toHaveBeenCalledWith(
      'systemTimeline',
      { query: { date: '2026-11-03' } },
      expect.anything(),
    );
    expect(request).toHaveBeenCalledWith(
      'systemCulprits',
      { query: { days: WEEK } },
      expect.anything(),
    );
  });

  it('falls back to the default range for a bad URL', async () => {
    const { client, request } = mockClient();
    renderAt('/system?days=nonsense&date=nonsense', client);

    await screen.findByRole('heading', { level: 1 });

    expect(request).toHaveBeenCalledWith(
      'systemCulprits',
      { query: { days: MONTH } },
      expect.anything(),
    );
  });

  it('asks for the previous day when the user steps back', async () => {
    const { client, request } = mockClient();
    renderAt('/system?date=2026-11-03', client);

    const back = await screen.findByRole(
      'button',
      { name: 'Previous day' },
      { timeout: LOOKUP_TIMEOUT_MS },
    );
    await userEvent.click(back);

    await vi.waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        'systemTimeline',
        { query: { date: '2026-11-02' } },
        expect.anything(),
      ),
    );
  });
});
