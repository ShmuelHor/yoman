import { afterEach, describe, expect, it } from 'vitest';

import { SessionList } from '../../src/contracts.js';
import type { StoredSpan } from '../../src/use-cases/store.js';
import { createMemoryStore } from '../memory-store.js';
import { createTestService, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

function stored(id: string, start: string, end: string, title: string | null): StoredSpan {
  return {
    id,
    appId: 'code',
    startMs: Date.parse(start),
    endMs: Date.parse(end),
    title,
    category: 'work',
    closed: true,
  };
}

const morning = stored(
  '00000000-0000-4000-8000-000000000001',
  '2026-11-08T08:00:00.000Z',
  '2026-11-08T09:00:00.000Z',
  'merge.ts',
);
const evening = stored(
  '00000000-0000-4000-8000-000000000002',
  '2026-11-08T18:00:00.000Z',
  '2026-11-08T19:00:00.000Z',
  null,
);

describe('GET /sessions', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('lists the sessions that overlap the range, valid against the shared contract', async () => {
    subject = createTestService(createMemoryStore({ sessions: [evening, morning] }));

    const response = await subject.service.app.inject({
      method: 'GET',
      url: '/sessions?from=2026-11-08T08:30:00.000Z&to=2026-11-08T12:00:00.000Z',
    });

    expect(response.statusCode).toBe(HTTP_OK);
    expect(SessionList.parse(response.json())).toEqual({
      items: [
        {
          id: morning.id,
          appId: 'code',
          start: '2026-11-08T08:00:00.000Z',
          end: '2026-11-08T09:00:00.000Z',
          title: 'merge.ts',
        },
      ],
    });
  });

  it.each([
    ['a missing range', '/sessions'],
    ['a reversed range', '/sessions?from=2026-11-09T00:00:00Z&to=2026-11-08T00:00:00Z'],
    ['a range over 92 days', '/sessions?from=2026-01-01T00:00:00Z&to=2026-11-08T00:00:00Z'],
    ['a non-date', "/sessions?from=1'%20OR%20'1'='1&to=2026-11-08T00:00:00Z"],
  ])('rejects %s with 400', async (_case, url) => {
    subject = createTestService();

    const response = await subject.service.app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
  });
});
