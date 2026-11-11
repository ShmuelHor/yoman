// @vitest-environment happy-dom
import { QueryClient, queryOptions } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { i18n } from 'i18next';
import { useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { GatewayClient } from '../../src/api/gateway.js';
import { createQueryClient } from '../../src/app/query-client.js';
import { bundledResources } from '../../src/i18n/bundled.js';
import { createI18n } from '../../src/i18n/i18n.js';
import { createNotifier } from '../../src/notify/notifier.js';
import { navPages, type PageRoute } from '../../src/router/page-route.js';
import { pageRoutes } from '../../src/router/pages.js';
import { prefetch } from '../../src/router/prefetch.js';
import { rootRoute } from '../../src/router/root-route.js';
import { renderRouter } from '../support/render-router.js';

const WEEK_ORDER = 1;
const DEV_TOOL_ORDER = 2;
const DEFAULT_RANGE = 7;
const RANGE_IN_URL = 30;
const MAX_RANGE = 90;

const WeekSearch = z.object({
  range: z.coerce.number().int().min(1).max(MAX_RANGE).catch(DEFAULT_RANGE),
});

const weekLoader = vi.fn<(client: GatewayClient) => Promise<string>>();

function Week(): React.JSX.Element {
  const { t } = useTranslation('today');
  const { range } = weekRoute.useSearch();
  return (
    <p>
      week page: {t('title')} range {range}
    </p>
  );
}

const weekRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/week',
  validateSearch: WeekSearch,
  loader: ({ context: { queryClient, client } }): void => {
    prefetch(queryClient, queryOptions({ queryKey: ['week'], queryFn: () => weekLoader(client) }));
  },
  component: Week,
});

const devToolRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev/tool',
  component: (): React.JSX.Element => <p>dev tool</p>,
});

const pages: readonly PageRoute[] = [
  ...pageRoutes,
  { path: 'week', namespace: 'today', order: WEEK_ORDER, route: weekRoute },
  {
    path: 'dev/tool',
    namespace: 'today',
    order: DEV_TOOL_ORDER,
    devOnly: true,
    route: devToolRoute,
  },
];

const root = document.documentElement;
const client = {
  request: () => new Promise(() => undefined),
} as unknown as GatewayClient;

function renderApp(path: string, queryClient?: QueryClient): i18n {
  const instance = createI18n(bundledResources, root);
  renderRouter({
    pages,
    path,
    queryClient: queryClient ?? createQueryClient(createNotifier(instance)),
    client,
    i18n: instance,
  });
  return instance;
}

describe('app router', () => {
  afterEach(() => {
    cleanup();
    weekLoader.mockReset();
  });

  it('registers the pages found under src/pages', () => {
    expect(pageRoutes.map(({ path }) => path)).toContain('/');
  });

  it('renders the index page inside the shell, in Hebrew and right to left', async () => {
    const instance = renderApp('/');

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe(instance.t('title', { ns: 'today', lng: 'he' }));
    expect(screen.getAllByRole('link')).toHaveLength(navPages(pages).length);
    expect([root.lang, root.dir]).toEqual(['he', 'rtl']);
  });

  it('flips the layout direction when the language is switched', async () => {
    const user = userEvent.setup();
    const instance = renderApp('/');

    await user.click(await screen.findByRole('combobox', { name: instance.t('language.label') }));
    await user.click(screen.getByRole('option', { name: instance.t('language.en') }));

    expect([root.lang, root.dir]).toEqual(['en', 'ltr']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Today');
  });

  it('switches the color theme from the shell', async () => {
    const user = userEvent.setup();
    const instance = renderApp('/');

    await user.click(await screen.findByRole('combobox', { name: instance.t('theme.label') }));
    await user.click(screen.getByRole('option', { name: instance.t('theme.dark') }));

    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('routes a nested page by its path', async () => {
    renderApp('/week');

    expect(await screen.findByText(/^week page:/u)).toBeDefined();
  });

  it('validates search params with the page schema', async () => {
    renderApp(`/week?range=${RANGE_IN_URL}`);

    expect(await screen.findByText(/range 30$/u)).toBeDefined();
  });

  it('falls back to the schema default for a malformed search param', async () => {
    renderApp('/week?range=banana');

    expect(await screen.findByText(new RegExp(`range ${DEFAULT_RANGE}$`, 'u'))).toBeDefined();
  });

  it('starts the page data in the loader, through the query cache', async () => {
    weekLoader.mockResolvedValue('week data');
    const queryClient = new QueryClient();

    renderApp('/week', queryClient);

    await waitFor(() => expect(queryClient.getQueryData(['week'])).toBe('week data'));
    expect(weekLoader).toHaveBeenCalledWith(client);
  });

  it('keeps the page rendering when its loader request fails', async () => {
    weekLoader.mockRejectedValue(new Error('down'));

    renderApp('/week');

    expect(await screen.findByText(/^week page:/u)).toBeDefined();
  });

  it('serves a dev-only page by URL without linking it from the navigation', async () => {
    renderApp('/dev/tool');

    expect(await screen.findByText('dev tool')).toBeDefined();
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).not.toContain('/dev/tool');
  });

  it('shows the not-found message for an unknown path', async () => {
    const instance = renderApp('/nowhere');

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe(instance.t('error.notFound'));
  });
});
