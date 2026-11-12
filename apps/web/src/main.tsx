import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createGatewayClient } from './api/gateway.js';
import { gatewayUrl } from './api/gateway-url.js';
import { App } from './app/app.js';
import { createQueryClient } from './app/query-client.js';
import { bundledResources } from './i18n/bundled.js';
import { createI18n } from './i18n/i18n.js';
import { createNotifier } from './notify/notifier.js';
import { pageRoutes } from './router/pages.js';
import { createAppRouter } from './router/router.js';

async function enableMocks(): Promise<void> {
  // `VITE_MOCKS=off npm run dev` talks to a real local gateway instead.
  if (!import.meta.env.DEV || import.meta.env.VITE_MOCKS === 'off') {
    return;
  }
  const [{ startMocks }, { devHandlers }] = await Promise.all([
    import('./mocks/browser.js'),
    import('./mocks/handlers.js'),
  ]);
  await startMocks(devHandlers(gatewayUrl(window.location)));
}

async function main(): Promise<void> {
  const container = document.getElementById('root');
  if (container === null) {
    throw new Error('index.html has no #root element');
  }
  await enableMocks();
  const i18n = createI18n(bundledResources, document.documentElement);
  const notifier = createNotifier(i18n);
  const queryClient = createQueryClient(notifier);
  const client = createGatewayClient(window.location);
  createRoot(container).render(
    <StrictMode>
      <App
        i18n={i18n}
        queryClient={queryClient}
        notifier={notifier}
        client={client}
        router={createAppRouter({ pages: pageRoutes, queryClient, client })}
      />
    </StrictMode>,
  );
}

void main();
