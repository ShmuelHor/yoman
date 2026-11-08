import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/app.js';
import { createQueryClient } from './app/query-client.js';
import { bundledResources } from './i18n/bundled.js';
import { createI18n } from './i18n/i18n.js';
import { pageRoutes } from './router/pages.js';
import { createAppRouter } from './router/router.js';
import './styles/base.css';

function main(): void {
  const container = document.getElementById('root');
  if (container === null) {
    throw new Error('index.html has no #root element');
  }
  const i18n = createI18n(bundledResources, document.documentElement);
  createRoot(container).render(
    <StrictMode>
      <App i18n={i18n} queryClient={createQueryClient()} router={createAppRouter(pageRoutes)} />
    </StrictMode>,
  );
}

main();
