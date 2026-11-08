import { requestFixtures } from '@yoman/shared/fixtures/requests';
import { createHandlers } from '@yoman/shared/msw';
import { type RouteName, routes } from '@yoman/shared/routes';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createGatewayClient } from './gateway.js';

const location = { protocol: 'http:', hostname: '127.0.0.1' };
// The handlers answer 400 to any request that breaks its contract.
const server = setupServer(...createHandlers('http://127.0.0.1:4711'));

describe('gateway client against the shared contracts', () => {
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterAll(() => server.close());

  it.each(Object.keys(routes) as RouteName[])(
    'calls %s with a valid request and parses its response',
    async (name) => {
      const api = createGatewayClient(location);

      // Fixtures are typed loosely (strings for every param); the contracts check them.
      const result = await api.request(name, requestFixtures[name] as never);

      expect(result === undefined).toBe(routes[name].response === null);
    },
  );

  it('types a route without input as callable with none', async () => {
    const session = await createGatewayClient(location).request('session');

    expect(typeof session.csrfToken).toBe('string');
  });
});
