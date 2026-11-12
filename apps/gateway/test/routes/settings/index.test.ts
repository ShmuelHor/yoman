import { settingsFixture } from '@yoman/shared/fixtures/data';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { toHandlerMap } from '../../../src/core/route-handler.js';
import { DEFAULT_SETTINGS } from '../../../src/core/settings-store.js';
import { handlers } from '../../../src/routes/settings/index.js';
import { testGateway, webSession } from '../../gateway-harness.js';
import { STATUS } from '../../harness.js';
import { memorySettings } from '../../memory-settings.js';

const JSON_HEADERS = { 'content-type': 'application/json' };

describe('settings routes', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(): Promise<{ gateway: FastifyInstance; headers: Record<string, string> }> {
    app = await testGateway({ handlers: toHandlerMap(handlers), settings: memorySettings() });
    const { headers } = await webSession(app);
    return { gateway: app, headers: { ...headers } };
  }

  it('reads the defaults of a fresh install', async () => {
    const { gateway, headers } = await start();

    const response = await gateway.inject({ method: 'GET', url: '/v1/settings', headers });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual(DEFAULT_SETTINGS);
  });

  it('replaces the settings and reads them back', async () => {
    const { gateway, headers } = await start();

    const update = await gateway.inject({
      method: 'PUT',
      url: '/v1/settings',
      headers: { ...headers, ...JSON_HEADERS },
      payload: settingsFixture,
    });
    const read = await gateway.inject({ method: 'GET', url: '/v1/settings', headers });

    expect(update.statusCode).toBe(STATUS.OK);
    expect(update.json()).toEqual(settingsFixture);
    expect(read.json()).toEqual(settingsFixture);
  });

  it.each([
    ['an unknown field', { ...settingsFixture, extra: 1 }],
    ['an unknown theme', { ...settingsFixture, theme: 'neon' }],
    ['a threshold above 100', { ...settingsFixture, thresholds: { memory: 101, cpu: 1, io: 1 } }],
    ['a system app with a shell character', { ...settingsFixture, systemApps: ['a;b'] }],
    ['quiet hours on without times', { ...settingsFixture, quietHours: { enabled: true } }],
  ])('rejects %s with a 400 and keeps what was stored', async (_name, payload) => {
    const { gateway, headers } = await start();

    const response = await gateway.inject({
      method: 'PUT',
      url: '/v1/settings',
      headers: { ...headers, ...JSON_HEADERS },
      payload,
    });
    const read = await gateway.inject({ method: 'GET', url: '/v1/settings', headers });

    expect(response.statusCode).toBe(STATUS.BAD_REQUEST);
    expect(read.json()).toEqual(DEFAULT_SETTINGS);
  });
});
