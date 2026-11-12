import { KnownAppList, KnownAppsResult } from '@yoman/shared/focus';
import { afterEach, describe, expect, it } from 'vitest';

import { createTestService, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

describe('known-apps routes', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('records discovered apps and lists them, both valid against the shared contract', async () => {
    subject = createTestService();
    const { app } = subject.service;
    const items = [
      { appId: 'org.telegram.desktop', name: 'Telegram', source: 'desktop' },
      { appId: 'slack', name: null, source: 'gsettings' },
    ];

    const reported = await app.inject({ method: 'POST', url: '/known-apps', payload: { items } });
    const again = await app.inject({ method: 'POST', url: '/known-apps', payload: { items } });
    const listed = await app.inject({ method: 'GET', url: '/known-apps' });

    expect(reported.statusCode).toBe(HTTP_OK);
    expect(KnownAppsResult.parse(reported.json())).toEqual({ added: 2 });
    expect(KnownAppsResult.parse(again.json())).toEqual({ added: 0 });
    expect(KnownAppList.parse(listed.json())).toEqual({
      items: items.map((item) => ({ ...item, firstSeenAt: expect.any(String) })),
    });
  });

  it('rejects an app id that could reach a shell with 400', async () => {
    subject = createTestService();

    const response = await subject.service.app.inject({
      method: 'POST',
      url: '/known-apps',
      payload: { items: [{ appId: '$(reboot)', name: null, source: 'desktop' }] },
    });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
  });
});
