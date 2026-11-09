import { Rule, type RuleInput, RuleList } from '@yoman/shared/sessions';
import { afterEach, describe, expect, it } from 'vitest';

import { createTestService, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const PRIORITY = 10;
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

const input: RuleInput = {
  field: 'title',
  match: 'contains',
  pattern: 'youtube',
  category: 'media',
  priority: PRIORITY,
};

describe('rules routes', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('creates, lists, updates and deletes a rule, each valid against the shared contract', async () => {
    subject = createTestService();
    const { app } = subject.service;

    const created = await app.inject({ method: 'POST', url: '/rules', payload: input });
    expect(created.statusCode).toBe(HTTP_CREATED);
    const rule = Rule.parse(created.json());

    const listed = await app.inject({ method: 'GET', url: '/rules' });
    expect(listed.statusCode).toBe(HTTP_OK);
    expect(RuleList.parse(listed.json())).toEqual({ items: [rule] });

    const updated = await app.inject({
      method: 'PUT',
      url: `/rules/${rule.id}`,
      payload: { ...input, category: 'video' },
    });
    expect(updated.statusCode).toBe(HTTP_OK);
    expect(Rule.parse(updated.json())).toEqual({ ...rule, category: 'video' });

    const deleted = await app.inject({ method: 'DELETE', url: `/rules/${rule.id}` });
    expect(deleted.statusCode).toBe(HTTP_NO_CONTENT);
    expect(deleted.body).toBe('');
    expect(subject.store.state().rules).toEqual([]);
  });

  it.each([
    ['PUT', { ...input }],
    ['DELETE', undefined],
  ] as const)('answers 404 to %s on an unknown rule', async (method, payload) => {
    subject = createTestService();

    const response = await subject.service.app.inject({
      method,
      url: `/rules/${MISSING_ID}`,
      ...(payload === undefined ? {} : { payload }),
    });

    expect(response.statusCode).toBe(HTTP_NOT_FOUND);
  });

  it.each([
    ['a regex match type', { ...input, match: 'regex' }],
    ['an empty pattern', { ...input, pattern: '' }],
    ['a priority out of range', { ...input, priority: -1 }],
    ['an unknown field', { ...input, sql: 'DROP TABLE category_rules' }],
  ])('rejects %s with 400', async (_case, payload) => {
    subject = createTestService();

    const response = await subject.service.app.inject({ method: 'POST', url: '/rules', payload });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
    expect(subject.store.state().rules).toEqual([]);
  });

  it('rejects a rule id that is not a uuid', async () => {
    subject = createTestService();

    const response = await subject.service.app.inject({ method: 'DELETE', url: "/rules/1'or'1" });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
  });
});
