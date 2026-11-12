import { FocusChange, FocusState, type Profile } from '@yoman/shared/focus';
import { afterEach, describe, expect, it } from 'vitest';

import { FocusTransition, RouteResult } from '../../src/contracts.js';
import { createMemoryStore } from '../memory-store.js';
import { createTestService, NOW, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const MINUTE_MS = 60_000;
const FOCUS_MINUTES = 25;

const profile: Profile = {
  id: '00000000-0000-4000-8000-0000000000aa',
  name: 'Deep work',
  mutedApps: ['org.telegram.desktop'],
  exceptions: [],
  muteNewApps: false,
};

const important = {
  alertKey: 'thermal:x:2026-11-08',
  type: 'thermal',
  level: 'important',
  ts: NOW.toISOString(),
  params: { celsius: 95 },
} as const;

function later(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * MINUTE_MS);
}

describe('focus routes', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('starts, reports, routes during and stops a focus, each valid against the shared contract', async () => {
    subject = createTestService(createMemoryStore({ profiles: [profile] }));
    const { app } = subject.service;

    const started = await app.inject({
      method: 'POST',
      url: '/start',
      payload: { minutes: FOCUS_MINUTES },
    });
    expect(started.statusCode).toBe(HTTP_OK);
    const { summary: _none, ...startChange } = FocusTransition.parse(started.json());
    expect(FocusChange.parse(startChange).commands).toEqual({
      mute: ['org.telegram.desktop'],
      restore: [],
    });

    subject.setNow(later(1));
    const state = await app.inject({ method: 'GET', url: '/state' });
    expect(FocusState.parse(state.json())).toMatchObject({ active: true, profileId: profile.id });

    const routed = await app.inject({
      method: 'POST',
      url: '/route',
      payload: { alerts: [important] },
    });
    expect(RouteResult.parse(routed.json())).toEqual({
      deliver: [],
      queued: 1,
      rateLimited: 0,
      summary: null,
    });

    subject.setNow(later(2));
    const stopped = await app.inject({ method: 'POST', url: '/stop' });
    const { summary, ...stopChange } = FocusTransition.parse(stopped.json());
    expect(FocusChange.parse(stopChange)).toEqual({
      state: { active: false },
      commands: { mute: [], restore: ['org.telegram.desktop'] },
    });
    expect(summary?.alerts).toEqual([{ alert: important, queuedAt: later(1).toISOString() }]);
  });

  it('starts until a local clock time in the configured zone', async () => {
    subject = createTestService(createMemoryStore({ profiles: [profile] }));

    const response = await subject.service.app.inject({
      method: 'POST',
      url: '/start',
      payload: { until: '13:00' },
    });

    // 10:00 UTC is 12:00 in Jerusalem.
    expect(FocusTransition.parse(response.json()).state).toMatchObject({
      endsAt: '2026-11-08T11:00:00.000Z',
    });
  });

  it('answers 404 when the profile does not exist', async () => {
    subject = createTestService();

    const response = await subject.service.app.inject({
      method: 'POST',
      url: '/start',
      payload: { minutes: 1 },
    });

    expect(response.statusCode).toBe(HTTP_NOT_FOUND);
  });

  it.each([
    ['zero minutes', { minutes: 0 }],
    ['more than 12 hours', { minutes: 721 }],
    ['both a duration and an end time', { minutes: 5, until: '13:00' }],
    ['an invalid clock time', { until: '24:00' }],
    ['a profile id that is not a uuid', { profileId: "1' OR '1'='1", minutes: 5 }],
  ])('rejects a start with %s with 400', async (_case, payload) => {
    subject = createTestService(createMemoryStore({ profiles: [profile] }));

    const response = await subject.service.app.inject({ method: 'POST', url: '/start', payload });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
    expect(subject.store.state().sessions).toEqual([]);
  });
});
