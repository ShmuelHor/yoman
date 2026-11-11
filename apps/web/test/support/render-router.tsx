import type { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { type RenderResult, render } from '@testing-library/react';
import type { i18n } from 'i18next';

import type { GatewayClient } from '../../src/api/gateway.js';
import { App } from '../../src/app/app.js';
import { createNotifier } from '../../src/notify/notifier.js';
import type { PageRoute } from '../../src/router/page-route.js';
import { createAppRouter } from '../../src/router/router.js';

interface RenderRouterOptions {
  readonly pages: readonly PageRoute[];
  readonly path: string;
  readonly queryClient: QueryClient;
  readonly client: GatewayClient;
  readonly i18n: i18n;
}

/**
 * Renders the whole app (providers, shell and the given pages) at `path`, with
 * a memory history. The router loads asynchronously, so assert with `findBy…`.
 */
export function renderRouter({
  pages,
  path,
  queryClient,
  client,
  i18n,
}: RenderRouterOptions): RenderResult {
  const router = createAppRouter({
    pages,
    queryClient,
    client,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(
    <App i18n={i18n} queryClient={queryClient} notifier={createNotifier(i18n)} router={router} />,
  );
}
