// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { i18n } from 'i18next';
import { useTranslation } from 'react-i18next';
import { createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../../src/app/app.js';
import { createQueryClient } from '../../src/app/query-client.js';
import { bundledResources } from '../../src/i18n/bundled.js';
import { createI18n } from '../../src/i18n/i18n.js';
import { createNotifier } from '../../src/notify/notifier.js';
import { navPages, type PageRoute } from '../../src/router/page-route.js';
import { pageRoutes } from '../../src/router/pages.js';
import { buildRoutes } from '../../src/router/router.js';

function Week(): React.JSX.Element {
  const { t } = useTranslation('today');
  return <p>week page: {t('title')}</p>;
}

function DevTool(): React.JSX.Element {
  return <p>dev tool</p>;
}

const WEEK_ORDER = 1;
const DEV_TOOL_ORDER = 2;
const pages: readonly PageRoute[] = [
  ...pageRoutes,
  { path: 'week', namespace: 'today', order: WEEK_ORDER, Component: Week },
  {
    path: 'dev/tool',
    namespace: 'today',
    order: DEV_TOOL_ORDER,
    devOnly: true,
    Component: DevTool,
  },
];

const root = document.documentElement;

function renderApp(path: string): i18n {
  const instance = createI18n(bundledResources, root);
  const router = createMemoryRouter(buildRoutes(pages), { initialEntries: [path] });
  const notifier = createNotifier(instance);
  render(
    <App
      i18n={instance}
      queryClient={createQueryClient(notifier)}
      notifier={notifier}
      router={router}
    />,
  );
  return instance;
}

describe('app router', () => {
  afterEach(cleanup);

  it('registers the pages found under src/pages', () => {
    expect(pageRoutes.map(({ path }) => path)).toContain('/');
  });

  it('renders the index page inside the shell, in Hebrew and right to left', () => {
    const instance = renderApp('/');

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      instance.t('title', { ns: 'today', lng: 'he' }),
    );
    expect(screen.getAllByRole('link')).toHaveLength(navPages(pages).length);
    expect([root.lang, root.dir]).toEqual(['he', 'rtl']);
  });

  it('flips the layout direction when the language is switched', async () => {
    const user = userEvent.setup();
    const instance = renderApp('/');

    await user.click(screen.getByRole('combobox', { name: instance.t('language.label') }));
    await user.click(screen.getByRole('option', { name: instance.t('language.en') }));

    expect([root.lang, root.dir]).toEqual(['en', 'ltr']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Today');
  });

  it('switches the color theme from the shell', async () => {
    const user = userEvent.setup();
    const instance = renderApp('/');

    await user.click(screen.getByRole('combobox', { name: instance.t('theme.label') }));
    await user.click(screen.getByRole('option', { name: instance.t('theme.dark') }));

    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('routes a nested page by its path', () => {
    renderApp('/week');

    expect(screen.getByText(/^week page:/u)).toBeDefined();
  });

  it('serves a dev-only page by URL without linking it from the navigation', () => {
    renderApp('/dev/tool');

    expect(screen.getByText('dev tool')).toBeDefined();
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).not.toContain('/dev/tool');
  });

  it('shows the not-found message for an unknown path', () => {
    const instance = renderApp('/nowhere');

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      instance.t('error.notFound'),
    );
  });
});
