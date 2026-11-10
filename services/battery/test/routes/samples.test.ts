import { Alert } from '@yoman/shared/alerts';
import { afterEach, describe, expect, it } from 'vitest';

import { SampleResult } from '../../src/contracts.js';
import { batterySample } from '../fixtures.js';
import { createTestService, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const CRITICAL_PCT = 5;

describe('POST /samples', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('answers with the alerts raised, valid against the shared Alert contract', async () => {
    subject = createTestService();

    const response = await subject.service.app.inject({
      method: 'POST',
      url: '/samples',
      payload: {
        samples: [batterySample('09:00'), batterySample('09:01', { capacityPct: CRITICAL_PCT })],
      },
    });

    expect(response.statusCode).toBe(HTTP_OK);
    const body = SampleResult.parse(response.json());
    expect(body.accepted).toBe(2);
    expect(body.alerts.map((alert) => Alert.parse(alert).type)).toEqual(['battery-critical']);
  });

  it.each([
    ['an empty batch', { samples: [] }],
    ['a window sample', { samples: [{ ...batterySample('09:00'), kind: 'window' }] }],
    ['a zero design energy', { samples: [batterySample('09:00', { energyFullDesignWh: 0 })] }],
    ['an unknown status', { samples: [{ ...batterySample('09:00'), status: 'exploding' }] }],
    ['an unknown field', { samples: [batterySample('09:00')], cmdline: 'x' }],
  ])('rejects %s with 400 and stores nothing', async (_case, payload) => {
    subject = createTestService();

    const response = await subject.service.app.inject({ method: 'POST', url: '/samples', payload });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(subject.store.state().samples).toEqual([]);
  });
});
