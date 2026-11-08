import type { RequestHandler } from 'msw';
import { setupWorker } from 'msw/browser';

/**
 * Starts MSW in the browser so the web runs without a backend. Only `vite dev`
 * imports this file, and the worker script is served by the dev server alone,
 * so neither reaches the production build. Unmocked requests pass through.
 */
export async function startMocks(handlers: readonly RequestHandler[]): Promise<void> {
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
}
