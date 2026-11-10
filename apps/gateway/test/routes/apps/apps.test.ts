import { appFixture } from '@yoman/shared/fixtures/data';
import { responseFixtures } from '@yoman/shared/fixtures/responses';
import { afterEach, describe, expect, it } from 'vitest';

import { NotFoundError, ServiceUnavailableError } from '../../../src/core/errors.js';
import { appHandlers } from '../../../src/routes/apps/apps.js';
import { STATUS, silentLogger } from '../../harness.js';
import { type CallKey, fakeServices, type RouteHarness, routeHarness } from '../route-harness.js';

const update = { name: 'Code', category: 'work' };
const JSON_HEADERS = { 'content-type': 'application/json' };

describe('app routes', () => {
  let harness: RouteHarness | undefined;

  afterEach(async () => {
    await harness?.app.close();
    harness = undefined;
  });

  async function start(replies: Partial<Record<CallKey, unknown>>): Promise<RouteHarness> {
    harness = await routeHarness(appHandlers, replies);
    return harness;
  }

  it('lists the apps', async () => {
    const { app, headers } = await start({ 'sessions GET /apps': responseFixtures.listApps });

    const response = await app.inject({ method: 'GET', url: '/v1/apps', headers });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual(responseFixtures.listApps);
  });

  it('renames and recategorizes the app named in the path', async () => {
    const { app, headers, calls } = await start({
      [`sessions PUT /apps/${appFixture.id}`]: appFixture,
    });

    const response = await app.inject({
      method: 'PUT',
      url: `/v1/apps/${appFixture.id}`,
      headers: { ...headers, ...JSON_HEADERS },
      payload: update,
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual(appFixture);
    expect(calls).toEqual([{ key: `sessions PUT /apps/${appFixture.id}`, body: update }]);
  });

  it('answers 404 when the sessions service has never seen the app', async () => {
    const { app, headers } = await start({ 'sessions PUT /apps/unknown': new NotFoundError() });

    const response = await app.inject({
      method: 'PUT',
      url: '/v1/apps/unknown',
      headers: { ...headers, ...JSON_HEADERS },
      payload: update,
    });

    expect(response.statusCode).toBe(STATUS.NOT_FOUND);
  });

  // Over a real socket the router passes `..` (raw or as `%2E%2E`) through as the
  // parameter, but `inject` normalizes the URL first, so the handler is called directly.
  it.each(['.', '..'])(
    'treats the dot segment %s as an unknown app, without calling the sessions service',
    async (id) => {
      const services = fakeServices({});
      const updateApp = appHandlers.updateApp;
      if (updateApp === undefined) {
        throw new Error('appHandlers has no updateApp');
      }

      const result = updateApp({
        params: { id },
        query: undefined,
        body: update,
        principal: { kind: 'session', id: 'test-session' },
        services: services.client,
        log: silentLogger,
      });

      await expect(result).rejects.toBeInstanceOf(NotFoundError);
      expect(services.calls).toEqual([]);
    },
  );

  it('answers 503 when the sessions service is down', async () => {
    const { app, headers } = await start({
      'sessions GET /apps': new ServiceUnavailableError('sessions', 'timeout'),
    });

    const response = await app.inject({ method: 'GET', url: '/v1/apps', headers });

    expect(response.statusCode).toBe(STATUS.UNAVAILABLE);
  });
});
