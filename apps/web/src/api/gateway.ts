import { routes } from '@yoman/shared/routes';

import { type ApiClient, createApiClient } from './client.js';
import { gatewayUrl } from './gateway-url.js';

export type GatewayRoutes = typeof routes;
export type GatewayClient = ApiClient<GatewayRoutes>;

/**
 * The client for every `/v1` route in the shared route map (T08). The CSRF
 * header for writes is added here once the session flow lands (T19).
 */
export function createGatewayClient(
  location: Pick<Location, 'protocol' | 'hostname'>,
  fetchImpl?: typeof fetch,
): GatewayClient {
  return createApiClient({
    routes,
    baseUrl: gatewayUrl(location),
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  });
}
