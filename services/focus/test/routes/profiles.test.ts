import { Profile, type ProfileInput, ProfileList } from '@yoman/shared/focus';
import { afterEach, describe, expect, it } from 'vitest';

import { createTestService, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

const input: ProfileInput = {
  name: 'Deep work',
  mutedApps: ['slack'],
  exceptions: ['thunderbird'],
  muteNewApps: true,
};

describe('profile routes', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('creates, lists, updates and deletes a profile, each valid against the shared contract', async () => {
    subject = createTestService();
    const { app } = subject.service;

    const created = await app.inject({ method: 'POST', url: '/profiles', payload: input });
    expect(created.statusCode).toBe(HTTP_CREATED);
    const profile = Profile.parse(created.json());

    const listed = await app.inject({ method: 'GET', url: '/profiles' });
    expect(ProfileList.parse(listed.json())).toEqual({ items: [profile] });

    const updated = await app.inject({
      method: 'PUT',
      url: `/profiles/${profile.id}`,
      payload: { ...input, muteNewApps: false },
    });
    expect(updated.statusCode).toBe(HTTP_OK);
    expect(Profile.parse(updated.json())).toEqual({ ...profile, muteNewApps: false });

    const deleted = await app.inject({ method: 'DELETE', url: `/profiles/${profile.id}` });
    expect(deleted.statusCode).toBe(HTTP_NO_CONTENT);
    expect(subject.store.state().profiles).toEqual([]);
  });

  it("answers 409 when deleting the running focus's profile", async () => {
    subject = createTestService();
    const { app } = subject.service;
    const profile = Profile.parse(
      (await app.inject({ method: 'POST', url: '/profiles', payload: input })).json(),
    );
    await app.inject({ method: 'POST', url: '/start', payload: { minutes: 5 } });

    const response = await app.inject({ method: 'DELETE', url: `/profiles/${profile.id}` });

    expect(response.statusCode).toBe(HTTP_CONFLICT);
  });

  it.each([
    ['PUT', { ...input }],
    ['DELETE', undefined],
  ] as const)('answers 404 to %s on an unknown profile', async (method, payload) => {
    subject = createTestService();

    const response = await subject.service.app.inject({
      method,
      url: `/profiles/${MISSING_ID}`,
      ...(payload === undefined ? {} : { payload }),
    });

    expect(response.statusCode).toBe(HTTP_NOT_FOUND);
  });

  it.each([
    ['an empty name', { ...input, name: '  ' }],
    ['an app id with a shell metacharacter', { ...input, mutedApps: ['slack;rm -rf ~'] }],
    ['an exception with a space', { ...input, exceptions: ['two words'] }],
    ['an unknown field', { ...input, admin: true }],
  ])('rejects %s with 400', async (_case, payload) => {
    subject = createTestService();

    const response = await subject.service.app.inject({
      method: 'POST',
      url: '/profiles',
      payload,
    });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
    expect(subject.store.state().profiles).toEqual([]);
  });
});
