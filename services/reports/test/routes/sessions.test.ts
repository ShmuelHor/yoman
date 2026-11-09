import { sessionFixture } from '@yoman/shared/fixtures/data';
import { afterEach, describe, expect, it } from 'vitest';

import { SessionBatchResult } from '../../src/contracts.js';
import { createTestService, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

const closed = { session: sessionFixture, category: 'work' };

describe('POST /sessions', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('counts the closed sessions the sessions service returned', async () => {
    subject = createTestService();

    const response = await subject.service.app.inject({
      method: 'POST',
      url: '/sessions',
      payload: { sessions: [closed, closed] },
    });

    expect(response.statusCode).toBe(HTTP_OK);
    expect(SessionBatchResult.parse(response.json())).toEqual({ counted: 1, duplicates: 1 });
    expect(subject.store.state().rollups).toHaveLength(1);
  });

  it.each([
    ['an empty batch', { sessions: [] }],
    [
      'an app id with a quote',
      { sessions: [{ ...closed, session: { ...sessionFixture, appId: "code'--" } }] },
    ],
    ['a category with a space', { sessions: [{ ...closed, category: 'deep work' }] }],
    [
      'an end before the start',
      {
        sessions: [{ ...closed, session: { ...sessionFixture, end: '2026-11-08T08:00:00.000Z' } }],
      },
    ],
    [
      'a session longer than a week',
      {
        sessions: [{ ...closed, session: { ...sessionFixture, end: '2026-12-08T09:00:00.000Z' } }],
      },
    ],
    [
      'a session before 2000',
      {
        sessions: [
          { ...closed, session: { ...sessionFixture, start: '1999-12-31T23:00:00.000Z' } },
        ],
      },
    ],
    ['an unknown field', { sessions: [closed], cmdline: 'x' }],
  ])('rejects %s with 400 and counts nothing', async (_case, payload) => {
    subject = createTestService();

    const response = await subject.service.app.inject({
      method: 'POST',
      url: '/sessions',
      payload,
    });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(subject.store.state().counted.size).toBe(0);
  });
});
