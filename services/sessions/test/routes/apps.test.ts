import { App, AppList } from '@yoman/shared/sessions';
import { afterEach, describe, expect, it } from 'vitest';

import { createMemoryStore } from '../memory-store.js';
import { createTestService, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

const code: App = { id: 'code', name: 'code', icon: null, category: null };

describe('apps routes', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('lists apps, valid against the shared AppList contract', async () => {
    subject = createTestService(createMemoryStore({ apps: [code] }));

    const response = await subject.service.app.inject({ method: 'GET', url: '/apps' });

    expect(response.statusCode).toBe(HTTP_OK);
    expect(AppList.parse(response.json())).toEqual({ items: [code] });
  });

  it('renames and recategorizes an app, valid against the shared App contract', async () => {
    subject = createTestService(createMemoryStore({ apps: [code] }));

    const response = await subject.service.app.inject({
      method: 'PUT',
      url: '/apps/code',
      payload: { name: 'VS Code', category: 'work' },
    });

    expect(response.statusCode).toBe(HTTP_OK);
    expect(App.parse(response.json())).toEqual({ ...code, name: 'VS Code', category: 'work' });
  });

  it('answers 404 for an unknown app', async () => {
    subject = createTestService();

    const response = await subject.service.app.inject({
      method: 'PUT',
      url: '/apps/vlc',
      payload: { name: 'VLC', category: null },
    });

    expect(response.statusCode).toBe(HTTP_NOT_FOUND);
    expect(response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'App not found', requestId: expect.any(String) },
    });
  });

  it('rejects an app id outside the allowed characters', async () => {
    subject = createTestService(createMemoryStore({ apps: [code] }));

    const response = await subject.service.app.inject({
      method: 'PUT',
      url: '/apps/code%3B%20DROP%20TABLE%20apps',
      payload: { name: 'x', category: null },
    });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
  });
});
