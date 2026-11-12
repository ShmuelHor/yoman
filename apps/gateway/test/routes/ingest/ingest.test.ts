import {
  alertFixture,
  dayReportFixture,
  focusActiveFixture,
  profileFixture,
  sessionFixture,
} from '@yoman/shared/fixtures/data';
import type { IngestBatch } from '@yoman/shared/ingest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { ServiceUnavailableError } from '../../../src/core/errors.js';
import { toHandlerMap } from '../../../src/core/route-handler.js';
import type { ServiceClient } from '../../../src/core/service-client.js';
import { createIngest, type IngestDeps } from '../../../src/routes/ingest/ingest-flow.js';
import { agentHeaders, testGateway } from '../../gateway-harness.js';
import { STATUS } from '../../harness.js';
import { type CallKey, fakeServices, type RecordedCall, routeHarness } from '../route-harness.js';
import { batterySample, pressureSample, windowSample } from './samples.js';

const THRESHOLDS = { memory: 11, cpu: 41, io: 31 };
const goalAlert = { ...alertFixture, alertKey: 'goal:1', type: 'goal-breach' as const };
const closed = { session: sessionFixture, category: 'work' };

const FULL_BATCH: IngestBatch = {
  agentVersion: '0.1.0',
  samples: [windowSample, batterySample, pressureSample],
};

const ALL_UP: Partial<Record<CallKey, unknown>> = {
  'sessions POST /samples': { accepted: 1, late: 0, closed: [closed] },
  'battery POST /samples': { accepted: 1, duplicates: 0, alerts: [alertFixture] },
  'system POST /samples': { accepted: 1, late: 0, alerts: [] },
  'reports POST /sessions': { counted: 1, duplicates: 0 },
  'reports GET /today': dayReportFixture,
  'goals POST /evaluate': { breaches: [goalAlert] },
  'focus POST /route': {
    deliver: [alertFixture],
    queued: 1,
    rateLimited: 0,
    summary: null,
  },
  'focus GET /state': focusActiveFixture,
  'focus GET /profiles': { items: [profileFixture] },
  'focus GET /known-apps': {
    items: [
      { appId: 'slack', name: 'Slack', source: 'desktop' },
      { appId: 'telegram', name: 'Telegram', source: 'desktop' },
    ],
  },
};

const DEPS: IngestDeps = {
  thresholds: (): Promise<typeof THRESHOLDS> => Promise.resolve(THRESHOLDS),
  systemApps: (): Promise<readonly string[]> => Promise.resolve(['org.gnome.Settings']),
};

/** The ingest rate limit (once per 10 s) is the agent's backoff to respect, not this test's. */
const NO_LIMIT = { max: Number.MAX_SAFE_INTEGER, timeWindow: 60_000 };

describe('POST /v1/ingest', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function ingest(
    replies: Partial<Record<CallKey, unknown>>,
    batch: IngestBatch = FULL_BATCH,
  ): Promise<{ response: LightMyRequestResponse; calls: RecordedCall[] }> {
    const harness = await routeHarness({ ingest: createIngest(DEPS) }, replies);
    app = harness.app;
    const response = await app.inject({
      method: 'POST',
      url: '/v1/ingest',
      headers: agentHeaders,
      payload: batch,
    });
    return { response, calls: harness.calls };
  }

  it('answers with what to notify, what is queued and what to mute', async () => {
    const { response } = await ingest(ALL_UP);

    expect(response.statusCode).toBe(STATUS.OK);
    expect(response.json()).toEqual({
      accepted: 3,
      deliver: [alertFixture],
      queued: 1,
      degraded: [],
      mute: {
        mute: ['discord', 'slack', 'telegram'],
        restore: [],
        endsAt: focusActiveFixture.active ? focusActiveFixture.endsAt : null,
        systemApps: ['org.gnome.Settings'],
      },
    });
  });

  it('sends each service only its own samples, with the thresholds to system', async () => {
    const { calls } = await ingest(ALL_UP);

    expect(calls).toContainEqual({
      key: 'sessions POST /samples',
      body: { samples: [windowSample] },
    });
    expect(calls).toContainEqual({
      key: 'battery POST /samples',
      body: { samples: [batterySample] },
    });
    expect(calls).toContainEqual({
      key: 'system POST /samples',
      body: { thresholds: THRESHOLDS, samples: [pressureSample] },
    });
  });

  it('forwards closed sessions to reports and evaluates goals on the day totals', async () => {
    const { calls } = await ingest(ALL_UP);

    expect(calls).toContainEqual({ key: 'reports POST /sessions', body: { sessions: [closed] } });
    expect(calls).toContainEqual({
      key: 'goals POST /evaluate',
      body: {
        date: dayReportFixture.date,
        apps: dayReportFixture.topApps,
        categories: dayReportFixture.byCategory,
      },
    });
  });

  it('routes the battery, system and goal alerts through focus together', async () => {
    const { calls } = await ingest(ALL_UP);

    expect(calls).toContainEqual({
      key: 'focus POST /route',
      body: { alerts: [alertFixture, goalAlert] },
    });
  });

  it('skips reports and goals when no session closed', async () => {
    const { calls } = await ingest({
      ...ALL_UP,
      'sessions POST /samples': { accepted: 1, late: 0, closed: [] },
    });

    expect(calls.map((call) => call.key)).not.toContain('reports POST /sessions');
    expect(calls.map((call) => call.key)).not.toContain('goals POST /evaluate');
  });

  it('does not call a service that has no samples in the batch', async () => {
    const { calls } = await ingest(ALL_UP, { agentVersion: '0.1.0', samples: [windowSample] });

    expect(calls.map((call) => call.key)).not.toContain('battery POST /samples');
    expect(calls.map((call) => call.key)).not.toContain('system POST /samples');
  });

  it('sends no commands, only the system apps, when focus is off', async () => {
    const { response } = await ingest({ ...ALL_UP, 'focus GET /state': { active: false } });

    expect(response.json()).toMatchObject({
      mute: { mute: [], restore: [], systemApps: ['org.gnome.Settings'] },
    });
  });

  it('fails the batch when a service that stores samples is down, so the agent retries', async () => {
    const { response } = await ingest({
      ...ALL_UP,
      'battery POST /samples': new ServiceUnavailableError('battery', 'timeout'),
    });

    expect(response.statusCode).toBe(STATUS.UNAVAILABLE);
  });

  it.each(['reports POST /sessions', 'reports GET /today', 'goals POST /evaluate'] as const)(
    'fails the batch when %s fails, so the agent resends',
    async (key) => {
      const service = key.startsWith('reports') ? 'reports' : 'goals';
      const { response, calls } = await ingest({
        ...ALL_UP,
        [key]: new ServiceUnavailableError(service, 'unreachable'),
      });

      expect(response.statusCode).toBe(STATUS.UNAVAILABLE);
      expect(calls.map((call) => call.key)).not.toContain('focus POST /route');
    },
  );

  it('hands reports and goals the closed session once, when a battery failure forces a resend', async () => {
    const services = fakeServices(ALL_UP);
    let batteryUp = false;
    const client: ServiceClient = {
      // Sessions answers the resend with the same closed session (its own test covers that).
      call: (service, request) =>
        service === 'battery' && !batteryUp
          ? Promise.reject(new ServiceUnavailableError('battery', 'timeout'))
          : services.client.call(service, request),
    };
    app = await testGateway({
      services: client,
      rateLimits: { ingest: NO_LIMIT },
      handlers: toHandlerMap({ ingest: createIngest(DEPS) }),
    });
    const send = (): Promise<LightMyRequestResponse> =>
      (app as FastifyInstance).inject({
        method: 'POST',
        url: '/v1/ingest',
        headers: agentHeaders,
        payload: FULL_BATCH,
      });

    const first = await send();
    const keysAfterFirst = services.calls.map((call) => call.key);
    batteryUp = true;
    const resend = await send();

    expect(first.statusCode).toBe(STATUS.UNAVAILABLE);
    expect(keysAfterFirst).not.toContain('reports POST /sessions');
    expect(resend.statusCode).toBe(STATUS.OK);
    const forwarded = (key: CallKey): RecordedCall[] =>
      services.calls.filter((call) => call.key === key);
    expect(forwarded('reports POST /sessions')).toEqual([
      { key: 'reports POST /sessions', body: { sessions: [closed] } },
    ]);
    expect(forwarded('goals POST /evaluate')).toHaveLength(1);
  });

  it('delivers the alerts as they are, without a mute decision, when focus is down', async () => {
    const { response } = await ingest({
      ...ALL_UP,
      'focus POST /route': new ServiceUnavailableError('focus', 'timeout'),
    });

    expect(response.statusCode).toBe(STATUS.OK);
    const body: Record<string, unknown> = response.json();
    expect(body).toMatchObject({
      deliver: [alertFixture, goalAlert],
      queued: 0,
      degraded: ['focus'],
    });
    expect(body).not.toHaveProperty('mute');
  });

  it('keeps the routed decision but sends no mute when focus fails after routing', async () => {
    const { response } = await ingest({
      ...ALL_UP,
      'focus GET /state': new ServiceUnavailableError('focus', 'timeout'),
    });

    const body: Record<string, unknown> = response.json();
    expect(body).toMatchObject({ deliver: [alertFixture], queued: 1, degraded: ['focus'] });
    expect(body).not.toHaveProperty('mute');
  });

  it('sends no mute when the known apps cannot be read for a profile that mutes new apps', async () => {
    const { response } = await ingest({
      ...ALL_UP,
      'focus GET /known-apps': new ServiceUnavailableError('focus', 'timeout'),
    });

    const body: Record<string, unknown> = response.json();
    expect(body).toMatchObject({ degraded: ['focus'] });
    expect(body).not.toHaveProperty('mute');
  });
});
