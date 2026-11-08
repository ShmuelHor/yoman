import { createHandlers } from '@yoman/shared/msw';
import type { RequestHandler } from 'msw';

/**
 * The MSW handlers for dev mode: every route in the shared route map (T08),
 * answered with its fixtures and checked against the same contracts as the gateway.
 */
export function devHandlers(baseUrl: string): RequestHandler[] {
  return createHandlers(baseUrl);
}
