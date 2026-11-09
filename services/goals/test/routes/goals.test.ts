import { Goal, type GoalInput, GoalList } from '@yoman/shared/goals';
import { afterEach, describe, expect, it } from 'vitest';

import { createTestService, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const TARGET = 30;
const OVER_A_DAY = 1_441;
const MONDAY = 1;
const NOT_A_WEEKDAY = 7;
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

const input: GoalInput = {
  type: 'max',
  target: { kind: 'app', appId: 'org.telegram.desktop' },
  minutes: TARGET,
  days: [0, 1],
};

describe('goals routes', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('creates, lists, updates and deletes a goal, each valid against the shared contract', async () => {
    subject = createTestService();
    const { app } = subject.service;

    const created = await app.inject({ method: 'POST', url: '/goals', payload: input });
    expect(created.statusCode).toBe(HTTP_CREATED);
    const goal = Goal.parse(created.json());
    expect(goal).toEqual({ id: goal.id, ...input });

    const listed = await app.inject({ method: 'GET', url: '/goals' });
    expect(listed.statusCode).toBe(HTTP_OK);
    expect(GoalList.parse(listed.json())).toEqual({ items: [goal] });

    const change = { ...input, type: 'min', target: { kind: 'category', category: 'work' } };
    const updated = await app.inject({ method: 'PUT', url: `/goals/${goal.id}`, payload: change });
    expect(updated.statusCode).toBe(HTTP_OK);
    expect(Goal.parse(updated.json())).toEqual({ id: goal.id, ...change });

    const deleted = await app.inject({ method: 'DELETE', url: `/goals/${goal.id}` });
    expect(deleted.statusCode).toBe(HTTP_NO_CONTENT);
    expect(deleted.body).toBe('');
    expect(subject.store.state().goals).toEqual([]);
  });

  it.each([
    ['PUT', { ...input }],
    ['DELETE', undefined],
  ] as const)('answers 404 to %s on an unknown goal', async (method, payload) => {
    subject = createTestService();

    const response = await subject.service.app.inject({
      method,
      url: `/goals/${MISSING_ID}`,
      ...(payload === undefined ? {} : { payload }),
    });

    expect(response.statusCode).toBe(HTTP_NOT_FOUND);
  });

  it.each([
    ['an unknown type', { ...input, type: 'exact' }],
    ['an app id with a space', { ...input, target: { kind: 'app', appId: 'my app' } }],
    ['a category target with an app id', { ...input, target: { kind: 'category', appId: 'x' } }],
    ['zero minutes', { ...input, minutes: 0 }],
    ['more minutes than a day', { ...input, minutes: OVER_A_DAY }],
    ['no days', { ...input, days: [] }],
    ['a repeated day', { ...input, days: [MONDAY, MONDAY] }],
    ['a day out of range', { ...input, days: [NOT_A_WEEKDAY] }],
    ['an unknown field', { ...input, sql: 'DROP TABLE goals' }],
  ])('rejects %s with 400', async (_case, payload) => {
    subject = createTestService();

    const response = await subject.service.app.inject({ method: 'POST', url: '/goals', payload });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
    expect(subject.store.state().goals).toEqual([]);
  });

  it('rejects a goal id that is not a uuid', async () => {
    subject = createTestService();

    const response = await subject.service.app.inject({ method: 'DELETE', url: "/goals/1'or'1" });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
  });
});
