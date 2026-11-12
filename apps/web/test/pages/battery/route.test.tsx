// @vitest-environment happy-dom

import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { responseFixtures } from '@yoman/shared/fixtures/responses';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GatewayClient } from '../../../src/api/gateway.js';
import { createQueryClient } from '../../../src/app/query-client.js';
import { bundledResources } from '../../../src/i18n/bundled.js';
import { createI18n } from '../../../src/i18n/i18n.js';
import { page } from '../../../src/pages/battery/route.js';
import { fakeNotifier } from '../../support/fake-notifier.js';
import { renderRouter } from '../../support/render-router.js';

/** Rendering the whole shell with a data grid is slow in happy-dom, more so when the suite runs in parallel. */
const RENDER_TIMEOUT_MS = 30_000;
const WEEK = 7;
const MONTH = 30;

function mockClient(): { client: GatewayClient; request: ReturnType<typeof vi.fn> } {
  const request = vi.fn((name: string) =>
    Promise.resolve(structuredClone(Reflect.get(responseFixtures, name))),
  );
  return { client: { request } as unknown as GatewayClient, request };
}

function renderAt(path: string, client: GatewayClient): void {
  renderRouter({
    pages: [page],
    path,
    queryClient: createQueryClient(fakeNotifier()),
    client,
    i18n: createI18n(bundledResources, document.createElement('html')),
  });
}

afterEach(cleanup);

describe('/battery route', { timeout: RENDER_TIMEOUT_MS }, () => {
  it('registers as a navigation page', () => {
    expect(page).toMatchObject({ path: 'battery', namespace: 'battery' });
  });

  it('loads the range from the URL', async () => {
    const { client, request } = mockClient();
    renderAt(`/battery?days=${WEEK}`, client);

    await screen.findByRole('heading', { level: 1 });

    expect(request).toHaveBeenCalledWith(
      'batteryHealthTrend',
      { query: { days: WEEK } },
      expect.anything(),
    );
  });

  it('falls back to the default range for a bad URL', async () => {
    const { client, request } = mockClient();
    renderAt('/battery?days=nonsense', client);

    await screen.findByRole('heading', { level: 1 });

    expect(request).toHaveBeenCalledWith(
      'batteryHealthTrend',
      { query: { days: MONTH } },
      expect.anything(),
    );
  });

  it('asks again for the new range when the user picks one', async () => {
    const { client, request } = mockClient();
    renderAt('/battery', client);
    await screen.findByRole('heading', { level: 1 });

    const toggle = await screen.findByRole('button', { name: /^7/u });
    await userEvent.click(toggle);

    await vi.waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        'batteryHealthTrend',
        { query: { days: WEEK } },
        expect.anything(),
      ),
    );
  });
});
