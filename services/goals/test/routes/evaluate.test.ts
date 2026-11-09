import { Alert } from '@yoman/shared/alerts';
import { type Goal, GoalProgress } from '@yoman/shared/goals';
import { afterEach, describe, expect, it } from 'vitest';

import { EvaluateResult } from '../../src/contracts.js';
import { createMemoryStore } from '../memory-store.js';
import { createTestService, NOW, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const SUNDAY = '2026-11-08';
const MONDAY = '2026-11-09';
const TARGET = 30;
const MINUTE = 60;
const USED = 45;

const goal: Goal = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'max',
  target: { kind: 'category', category: 'social' },
  minutes: TARGET,
  days: [0],
};

const totals = {
  date: SUNDAY,
  apps: [{ appId: 'org.telegram.desktop', seconds: USED * MINUTE }],
  categories: [{ category: 'social', seconds: USED * MINUTE }],
};

describe('POST /evaluate', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('returns a breach alert valid against the shared contract, once a day', async () => {
    subject = createTestService(createMemoryStore({ goals: [goal] }));
    const { app } = subject.service;

    const first = await app.inject({ method: 'POST', url: '/evaluate', payload: totals });
    const again = await app.inject({ method: 'POST', url: '/evaluate', payload: totals });

    expect(first.statusCode).toBe(HTTP_OK);
    const [alert] = EvaluateResult.parse(first.json()).breaches;
    expect(Alert.parse(alert)).toEqual({
      alertKey: `goal-breach:${goal.id}:${SUNDAY}`,
      type: 'goal-breach',
      level: 'normal',
      ts: NOW.toISOString(),
      params: { target: 'social', minutesUsed: USED, targetMinutes: TARGET },
    });
    expect(EvaluateResult.parse(again.json())).toEqual({ breaches: [] });
  });

  it.each([
    ['a non-date', { ...totals, date: "2026-11-08' OR '1'='1" }],
    ['a repeated app', { ...totals, apps: [...totals.apps, ...totals.apps] }],
    [
      'a repeated category',
      { ...totals, categories: [...totals.categories, ...totals.categories] },
    ],
    ['negative seconds', { ...totals, apps: [{ appId: 'code', seconds: -1 }] }],
    ['an unknown field', { ...totals, extra: true }],
  ])('rejects %s with 400', async (_case, payload) => {
    subject = createTestService();

    const response = await subject.service.app.inject({
      method: 'POST',
      url: '/evaluate',
      payload,
    });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
    expect(subject.store.state().usage).toEqual({});
  });
});

describe('GET /progress', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('reports progress from the last totals, valid against the shared contract', async () => {
    subject = createTestService(createMemoryStore({ goals: [goal] }));
    const { app } = subject.service;
    await app.inject({ method: 'POST', url: '/evaluate', payload: totals });

    const response = await app.inject({ method: 'GET', url: `/progress?date=${SUNDAY}` });

    expect(response.statusCode).toBe(HTTP_OK);
    expect(GoalProgress.parse(response.json())).toEqual({
      date: SUNDAY,
      items: [{ goalId: goal.id, minutesUsed: USED, targetMinutes: TARGET, status: 'breached' }],
    });
  });

  it('lists no goals on a day they do not apply', async () => {
    subject = createTestService(createMemoryStore({ goals: [goal] }));

    const response = await subject.service.app.inject({
      method: 'GET',
      url: `/progress?date=${MONDAY}`,
    });

    expect(GoalProgress.parse(response.json())).toEqual({ date: MONDAY, items: [] });
  });

  it.each([
    ['a missing date', '/progress'],
    ['a non-date', "/progress?date=1'%20OR%20'1'='1"],
    ['an impossible date', '/progress?date=2026-02-30'],
  ])('rejects %s with 400', async (_case, url) => {
    subject = createTestService();

    const response = await subject.service.app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
  });
});
