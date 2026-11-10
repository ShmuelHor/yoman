import { AlertPolicy, AlertQueue } from '@yoman/shared/focus';
import { afterEach, describe, expect, it } from 'vitest';

import { RouteResult } from '../../src/contracts.js';
import { createTestService, NOW, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

const alert = {
  alertKey: 'battery-low:15',
  type: 'battery-low',
  level: 'important',
  ts: NOW.toISOString(),
  params: { percent: 14 },
};

describe('alert routes', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('delivers outside focus and drops a repeat of the same key', async () => {
    subject = createTestService();
    const { app } = subject.service;

    const first = await app.inject({ method: 'POST', url: '/route', payload: { alerts: [alert] } });
    const repeat = await app.inject({
      method: 'POST',
      url: '/route',
      payload: { alerts: [alert] },
    });

    expect(first.statusCode).toBe(HTTP_OK);
    expect(RouteResult.parse(first.json()).deliver).toEqual([alert]);
    expect(RouteResult.parse(repeat.json())).toMatchObject({ deliver: [], rateLimited: 1 });
  });

  it('accepts an empty batch, so a run-out session can be closed on every ingest', async () => {
    subject = createTestService();

    const response = await subject.service.app.inject({
      method: 'POST',
      url: '/route',
      payload: { alerts: [] },
    });

    expect(RouteResult.parse(response.json())).toEqual({
      deliver: [],
      queued: 0,
      rateLimited: 0,
      summary: null,
    });
  });

  it('answers an empty queue that validates against the shared contract', async () => {
    subject = createTestService();

    const response = await subject.service.app.inject({ method: 'GET', url: '/queue' });

    expect(AlertQueue.parse(response.json())).toEqual({ items: [] });
  });

  it('replaces and reads the alert policy against the shared contract', async () => {
    subject = createTestService();
    const { app } = subject.service;
    const policy = { items: [{ type: 'thermal', level: 'critical' }] };

    const replaced = await app.inject({ method: 'PUT', url: '/alert-policy', payload: policy });
    const read = await app.inject({ method: 'GET', url: '/alert-policy' });

    expect(AlertPolicy.parse(replaced.json())).toEqual(policy);
    expect(AlertPolicy.parse(read.json())).toEqual(policy);
  });

  it.each([
    ['an unknown alert type', { alerts: [{ ...alert, type: 'rm -rf' }] }],
    ['an alert key with a quote', { alerts: [{ ...alert, alertKey: "a'b" }] }],
    ['an unknown field', { alerts: [alert], sql: 'DROP TABLE queued_alerts' }],
  ])('rejects a route request with %s with 400', async (_case, payload) => {
    subject = createTestService();

    const response = await subject.service.app.inject({ method: 'POST', url: '/route', payload });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
  });

  it('rejects a policy that names a type twice with 400', async () => {
    subject = createTestService();

    const response = await subject.service.app.inject({
      method: 'PUT',
      url: '/alert-policy',
      payload: {
        items: [
          { type: 'thermal', level: 'critical' },
          { type: 'thermal', level: 'normal' },
        ],
      },
    });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
  });
});
