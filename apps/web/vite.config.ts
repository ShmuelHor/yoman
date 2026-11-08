import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const WEB_PORT = 4710;
const WORKER_PATH = '/mockServiceWorker.js';

/**
 * Serves MSW's service worker straight from the installed package during
 * `vite dev`. Nothing is copied into `public/`, so the worker can never ship in
 * the production build, and it always matches the installed msw version.
 */
function mswWorker(): Plugin {
  const workerFile = createRequire(import.meta.url).resolve('msw/mockServiceWorker.js');
  return {
    name: 'yoman-msw-worker',
    apply: 'serve',
    configureServer(server): void {
      server.middlewares.use(WORKER_PATH, (_request, response, next) => {
        readFile(workerFile).then(
          (body) => {
            response.setHeader('Content-Type', 'text/javascript');
            response.end(body);
          },
          (error: unknown) => next(error),
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), mswWorker()],
  // Static files are not used yet; turning publicDir off keeps stray files out of dist.
  publicDir: false,
  server: { host: '127.0.0.1', port: WEB_PORT, strictPort: true },
  preview: { host: '127.0.0.1', port: WEB_PORT, strictPort: true },
  build: {
    // Inlined assets would become data: URLs, which the CSP does not allow.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
