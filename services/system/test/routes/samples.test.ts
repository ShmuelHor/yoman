import { Alert } from '@yoman/shared/alerts';
import { afterEach, describe, expect, it } from 'vitest';

import { SampleResult } from '../../src/contracts.js';
import { pressure, pressureRun, process, processes, THRESHOLDS, thermal } from '../samples.js';
import { createTestService, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HIGH_CPU = 60;
const NODE_PID = 42;
const NODE_CPU_PCT = 97;
const WARM_C = 50;

describe('POST /samples', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('answers with the alerts of new incidents, valid against the shared Alert contract', async () => {
    subject = createTestService();
    const samples = [
      ...pressureRun('09:00:00', '09:00:30', HIGH_CPU),
      processes('09:00:10', [process(NODE_PID, { comm: 'node', cpuPct: NODE_CPU_PCT })]),
      thermal('09:00:00', WARM_C),
    ];

    const response = await subject.service.app.inject({
      method: 'POST',
      url: '/samples',
      payload: { thresholds: THRESHOLDS, samples },
    });

    expect(response.statusCode).toBe(HTTP_OK);
    const body = SampleResult.parse(response.json());
    expect(body.accepted).toBe(samples.length);
    expect(body.alerts.map((alert) => Alert.parse(alert).params)).toEqual([
      { resource: 'cpu', peak: HIGH_CPU, comm: 'node', pid: NODE_PID },
    ]);
  });

  it.each([
    ['an empty batch', { thresholds: THRESHOLDS, samples: [] }],
    ['missing thresholds', { samples: [pressure('09:00:00', 1)] }],
    [
      'a threshold over 100',
      { thresholds: { ...THRESHOLDS, cpu: 101 }, samples: [pressure('09:00:00', 1)] },
    ],
    [
      'a window sample',
      {
        thresholds: THRESHOLDS,
        samples: [
          {
            kind: 'window',
            ts: '2026-11-08T09:00:00Z',
            wmClass: 'code',
            pid: 1,
            idleMs: 0,
            locked: false,
          },
        ],
      },
    ],
    [
      'a process cmdline',
      {
        thresholds: THRESHOLDS,
        samples: [processes('09:00:00', [{ ...process(1), cmdline: 'x' } as never])],
      },
    ],
    ['an unknown field', { thresholds: THRESHOLDS, samples: [pressure('09:00:00', 1)], extra: 1 }],
  ])('rejects %s with 400 and stores nothing', async (_case, payload) => {
    subject = createTestService();

    const response = await subject.service.app.inject({ method: 'POST', url: '/samples', payload });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(subject.store.state().pressure).toEqual([]);
  });
});
