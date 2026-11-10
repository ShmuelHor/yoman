import { afterEach, describe, expect, it } from 'vitest';

import { Schedule, ScheduleList } from '../../src/contracts.js';
import { createMemoryStore } from '../memory-store.js';
import { createTestService, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const WORKDAYS = 5;
const SUNDAY_TO_THURSDAY = Array.from({ length: WORKDAYS }, (_, day) => day);
const NO_SUCH_WEEKDAY = 7;
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

const profile = {
  id: '00000000-0000-4000-8000-0000000000aa',
  name: 'Deep work',
  mutedApps: [],
  exceptions: [],
  muteNewApps: true,
};

const input = {
  profileId: profile.id,
  days: SUNDAY_TO_THURSDAY,
  start: '09:00',
  end: '12:00',
  enabled: true,
};

describe('schedule routes', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('creates, lists, updates and deletes a schedule', async () => {
    subject = createTestService(createMemoryStore({ profiles: [profile] }));
    const { app } = subject.service;

    const created = await app.inject({ method: 'POST', url: '/schedules', payload: input });
    expect(created.statusCode).toBe(HTTP_CREATED);
    const schedule = Schedule.parse(created.json());

    const listed = await app.inject({ method: 'GET', url: '/schedules' });
    expect(ScheduleList.parse(listed.json())).toEqual({ items: [schedule] });

    const overnight = { ...input, start: '22:00', end: '06:00' };
    const updated = await app.inject({
      method: 'PUT',
      url: `/schedules/${schedule.id}`,
      payload: overnight,
    });
    expect(updated.statusCode).toBe(HTTP_OK);
    expect(Schedule.parse(updated.json())).toEqual({ ...schedule, ...overnight });

    const deleted = await app.inject({ method: 'DELETE', url: `/schedules/${schedule.id}` });
    expect(deleted.statusCode).toBe(HTTP_NO_CONTENT);
    expect(subject.store.state().schedules).toEqual([]);
  });

  it('answers 404 to an unknown schedule', async () => {
    subject = createTestService(createMemoryStore({ profiles: [profile] }));

    const response = await subject.service.app.inject({
      method: 'PUT',
      url: `/schedules/${MISSING_ID}`,
      payload: input,
    });

    expect(response.statusCode).toBe(HTTP_NOT_FOUND);
  });

  it.each([
    ['repeated days', { ...input, days: [1, 1] }],
    ['no days', { ...input, days: [] }],
    ['a weekday out of range', { ...input, days: [NO_SUCH_WEEKDAY] }],
    ['the same start and end', { ...input, end: '09:00' }],
    ['a clock time out of range', { ...input, start: '25:00' }],
  ])('rejects %s with 400', async (_case, payload) => {
    subject = createTestService(createMemoryStore({ profiles: [profile] }));

    const response = await subject.service.app.inject({
      method: 'POST',
      url: '/schedules',
      payload,
    });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
  });
});
