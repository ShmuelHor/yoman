import { routes } from '@yoman/shared/routes';

import { type ApiClient, createApiClient } from './client.js';
import { gatewayUrl } from './gateway-url.js';
import { withWebSession } from './session-fetch.js';

export type GatewayRoutes = typeof routes;
export type GatewayClient = ApiClient<GatewayRoutes>;

/**
 * The client for every `/v1` route in the shared route map (T08). It opens the
 * gateway session on first use and sends the CSRF token on writes.
 */
export function createGatewayClient(
  location: Pick<Location, 'protocol' | 'hostname'>,
  fetchImpl?: typeof fetch,
): GatewayClient {
  const baseUrl = gatewayUrl(location);
  const send = fetchImpl ?? globalThis.fetch.bind(globalThis);
  return createApiClient({ routes, baseUrl, fetch: withWebSession(baseUrl, send) });
}
