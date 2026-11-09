import type { WindowSample } from '@yoman/shared/ingest';
import { Session } from '@yoman/shared/sessions';
import { afterEach, describe, expect, it } from 'vitest';

import { SampleResult } from '../../src/contracts.js';
import { createTestService, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const PID = 4242;

function window(clock: string, wmClass: string): WindowSample {
  return {
    kind: 'window',
    ts: `2026-11-08T${clock}.000Z`,
    wmClass,
    title: `${wmClass} window`,
    pid: PID,
    idleMs: 0,
    locked: false,
  };
}

describe('POST /samples', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('answers with the closed sessions, valid against the shared Session contract', async () => {
    subject = createTestService();

    const response = await subject.service.app.inject({
      method: 'POST',
      url: '/samples',
      payload: { samples: [window('09:00:00', 'code'), window('09:00:05', 'firefox')] },
    });

    expect(response.statusCode).toBe(HTTP_OK);
    const body = SampleResult.parse(response.json());
    expect(body.closed.map((closed) => Session.parse(closed.session).appId)).toEqual(['code']);
  });

  it.each([
    ['an empty batch', { samples: [] }],
    ['a battery sample', { samples: [{ ...window('09:00:00', 'code'), kind: 'battery' }] }],
    ['a wm_class with a quote', { samples: [window('09:00:00', "code'--")] }],
    ['an unknown field', { samples: [window('09:00:00', 'code')], cmdline: 'x' }],
  ])('rejects %s with 400 and stores nothing', async (_case, payload) => {
    subject = createTestService();

    const response = await subject.service.app.inject({ method: 'POST', url: '/samples', payload });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(subject.store.state().sessions).toEqual([]);
  });
});
