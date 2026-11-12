import { FIXTURE_IDS, profileFixture } from '@yoman/shared/fixtures/data';
import { requestFixtures } from '@yoman/shared/fixtures/requests';
import { responseFixtures } from '@yoman/shared/fixtures/responses';
import { AlertPolicy, FocusStart, KnownAppsReport } from '@yoman/shared/focus';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { NotFoundError, ServiceUnavailableError } from '../../../src/core/errors.js';
import { DEFAULT_SETTINGS } from '../../../src/core/settings-store.js';
import { handlers } from '../../../src/routes/focus/index.js';
import { agentHeaders } from '../../gateway-harness.js';
import { STATUS } from '../../harness.js';
import { memorySettings } from '../../memory-settings.js';
import { type CallKey, type RouteHarness, routeHarness } from '../route-harness.js';

const { id: _id, ...profileInput } = profileFixture;
const PROFILE_PATH = `/profiles/${FIXTURE_IDS.profile}`;
const START_BODY = FocusStart.parse(requestFixtures.focusStart.body);
const KNOWN_APPS_BODY = KnownAppsReport.parse(requestFixtures.reportKnownApps.body);
const POLICY = AlertPolicy.parse(responseFixtures.updateAlertPolicy);
const JSON_HEADERS = { 'content-type': 'application/json' };
const SUMMARY = {
  profileId: FIXTURE_IDS.profile,
  startedAt: '2026-11-08T08:00:00.000Z',
  endedAt: '2026-11-08T08:50:00.000Z',
  alerts: [],
};

describe('focus routes', () => {
  let harness: RouteHarness | undefined;

  afterEach(async () => {
    await harness?.app.close();
    harness = undefined;
  });

  async function start(
    replies: Partial<Record<CallKey, unknown>>,
    settings = memorySettings(),
  ): Promise<RouteHarness> {
    harness = await routeHarness(handlers, replies, settings);
    return harness;
  }

  function app(): FastifyInstance {
    if (harness === undefined) {
      throw new Error('call start() first');
    }
    return harness.app;
  }

  it('starts a focus with the validated body and returns the mute commands', async () => {
    const { headers, calls } = await start({
      'focus POST /start': { ...responseFixtures.focusStart, summary: null },
    });

    const response = await app().inject({
      method: 'POST',
      url: '/v1/focus/start',
      headers: { ...headers, ...JSON_HEADERS },
      payload: START_BODY,
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual(responseFixtures.focusStart);
    expect(calls).toEqual([{ key: 'focus POST /start', body: START_BODY }]);
  });

  it('stops the focus and returns the restore commands, without the internal summary', async () => {
    const { headers } = await start({
      'focus POST /stop': { ...responseFixtures.focusStop, summary: SUMMARY },
    });

    const response = await app().inject({ method: 'POST', url: '/v1/focus/stop', headers });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual(responseFixtures.focusStop);
  });

  it('answers 404 when the focus service has no such profile to start with', async () => {
    const { headers } = await start({ 'focus POST /start': new NotFoundError() });

    const response = await app().inject({
      method: 'POST',
      url: '/v1/focus/start',
      headers: { ...headers, ...JSON_HEADERS },
      payload: START_BODY,
    });

    expect(response.statusCode).toBe(STATUS.NOT_FOUND);
  });

  it('serves the focus start to the agent too', async () => {
    await start({ 'focus POST /start': { ...responseFixtures.focusStart, summary: null } });

    const response = await app().inject({
      method: 'POST',
      url: '/v1/focus/start',
      headers: { ...agentHeaders, ...JSON_HEADERS },
      payload: { minutes: 25 },
    });

    expect(response.statusCode).toBe(STATUS.OK);
  });

  it.each([
    ['focusState', '/v1/focus/state', 'focus GET /state'],
    ['listProfiles', '/v1/focus/profiles', 'focus GET /profiles'],
    ['focusQueue', '/v1/focus/queue', 'focus GET /queue'],
    ['listKnownApps', '/v1/focus/known-apps', 'focus GET /known-apps'],
    ['getAlertPolicy', '/v1/focus/alert-policy', 'focus GET /alert-policy'],
  ] as const)('reads %s from the focus service', async (name, url, key) => {
    const { headers } = await start({ [key]: responseFixtures[name] });

    const response = await app().inject({ method: 'GET', url, headers });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual(responseFixtures[name]);
  });

  it('creates a profile and answers 201', async () => {
    const { headers, calls } = await start({ 'focus POST /profiles': profileFixture });

    const response = await app().inject({
      method: 'POST',
      url: '/v1/focus/profiles',
      headers: { ...headers, ...JSON_HEADERS },
      payload: profileInput,
    });

    expect(response.statusCode).toBe(STATUS.CREATED);
    expect(response.json()).toEqual(profileFixture);
    expect(calls).toEqual([{ key: 'focus POST /profiles', body: profileInput }]);
  });

  it('updates the profile named in the path', async () => {
    const { headers, calls } = await start({ [`focus PUT ${PROFILE_PATH}`]: profileFixture });

    const response = await app().inject({
      method: 'PUT',
      url: `/v1/focus${PROFILE_PATH}`,
      headers: { ...headers, ...JSON_HEADERS },
      payload: profileInput,
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(calls).toEqual([{ key: `focus PUT ${PROFILE_PATH}`, body: profileInput }]);
  });

  it('deletes a profile and answers 204 with no body', async () => {
    const { headers } = await start({ [`focus DELETE ${PROFILE_PATH}`]: undefined });

    const response = await app().inject({
      method: 'DELETE',
      url: `/v1/focus${PROFILE_PATH}`,
      headers,
    });

    expect(response.statusCode).toBe(STATUS.NO_CONTENT);
    expect(response.body).toBe('');
  });

  it('takes the agent known-apps report and answers how many were new', async () => {
    const { calls } = await start({ 'focus POST /known-apps': responseFixtures.reportKnownApps });

    const response = await app().inject({
      method: 'POST',
      url: '/v1/focus/known-apps',
      headers: { ...agentHeaders, ...JSON_HEADERS },
      payload: KNOWN_APPS_BODY,
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual(responseFixtures.reportKnownApps);
    expect(calls).toEqual([{ key: 'focus POST /known-apps', body: KNOWN_APPS_BODY }]);
  });

  it('replaces the alert policy', async () => {
    const { headers, calls } = await start({
      'focus PUT /alert-policy': responseFixtures.updateAlertPolicy,
    });

    const response = await app().inject({
      method: 'PUT',
      url: '/v1/focus/alert-policy',
      headers: { ...headers, ...JSON_HEADERS },
      payload: POLICY,
    });

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual(responseFixtures.updateAlertPolicy);
    expect(calls).toEqual([{ key: 'focus PUT /alert-policy', body: POLICY }]);
  });

  it('answers 503 when the focus service is down', async () => {
    const { headers } = await start({
      'focus GET /state': new ServiceUnavailableError('focus', 'unreachable'),
    });

    const response = await app().inject({ method: 'GET', url: '/v1/focus/state', headers });

    expect(response.statusCode).toBe(STATUS.UNAVAILABLE);
  });

  it('filters system apps out of the start mute commands, built-in and from settings', async () => {
    const { headers } = await start(
      {
        'focus POST /start': {
          state: responseFixtures.focusStart.state,
          commands: { mute: ['slack', 'org.gnome.Shell', 'Telegram'], restore: [] },
          summary: null,
        },
      },
      memorySettings({ ...DEFAULT_SETTINGS, systemApps: ['telegram'] }),
    );

    const response = await app().inject({
      method: 'POST',
      url: '/v1/focus/start',
      headers: { ...headers, ...JSON_HEADERS },
      payload: START_BODY,
    });

    expect(response.json().commands.mute).toEqual(['slack']);
  });
});
