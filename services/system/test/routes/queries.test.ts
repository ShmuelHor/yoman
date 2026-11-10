import { CulpritList, IncidentList, SystemTimeline } from '@yoman/shared/system';
import { afterEach, describe, expect, it } from 'vitest';

import type { StoredIncident } from '../../src/use-cases/store.js';
import { createMemoryStore } from '../memory-store.js';
import { at, pressure } from '../samples.js';
import { createTestService, type TestService } from '../test-service.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const CPU_SOME = 4.2;

const finished: StoredIncident = {
  id: '9c4f5d2b-4e60-4f81-b2a3-cd4e5f607182',
  type: 'memory',
  startMs: Date.parse(at('08:12:00')),
  endMs: Date.parse(at('08:14:30')),
  peak: 27.5,
  culprits: [
    { pid: 3141, comm: 'node', container: 'yoman-web-1', cpuPct: 96, rssBytes: 2_147_483_648 },
  ],
  pid: null,
};

const open: StoredIncident = {
  ...finished,
  id: 'ad506e3c-5f71-4092-83b4-de5f60718293',
  type: 'cpu',
  startMs: Date.parse(at('09:30:00')),
  endMs: null,
};

describe('system queries', () => {
  let subject: TestService;

  afterEach(async () => {
    await subject.service.stop();
  });

  it('lists the incidents overlapping a range, open ones included, valid against IncidentList', async () => {
    subject = createTestService(createMemoryStore({ incidents: [open, finished] }));

    const response = await subject.service.app.inject({
      method: 'GET',
      url: `/incidents?from=${at('08:13:00')}&to=${at('12:00:00')}`,
    });

    expect(response.statusCode).toBe(HTTP_OK);
    expect(IncidentList.parse(response.json())).toEqual({
      items: [
        {
          id: finished.id,
          type: 'memory',
          start: at('08:12:00'),
          end: at('08:14:30'),
          peak: 27.5,
          culprits: finished.culprits,
        },
        {
          id: open.id,
          type: 'cpu',
          start: at('09:30:00'),
          end: null,
          peak: 27.5,
          culprits: finished.culprits,
        },
      ],
    });
  });

  it('ranks culprits over the last days, valid against CulpritList', async () => {
    subject = createTestService(createMemoryStore({ incidents: [open, finished] }));

    const response = await subject.service.app.inject({ method: 'GET', url: '/culprits?days=7' });

    expect(response.statusCode).toBe(HTTP_OK);
    expect(CulpritList.parse(response.json())).toEqual({
      items: [{ comm: 'node', container: 'yoman-web-1', incidents: 2 }],
    });
  });

  it('returns a local day timeline, valid against SystemTimeline', async () => {
    subject = createTestService(
      createMemoryStore({ pressure: [pressure('08:12:00', CPU_SOME)], incidents: [finished] }),
    );

    const response = await subject.service.app.inject({
      method: 'GET',
      url: '/timeline?date=2026-11-08',
    });

    expect(response.statusCode).toBe(HTTP_OK);
    const timeline = SystemTimeline.parse(response.json());
    expect(timeline.points).toEqual([{ ts: at('08:12:00'), cpu: CPU_SOME, memory: 1, io: 1 }]);
    expect(timeline.incidents.map((incident) => incident.id)).toEqual([finished.id]);
  });

  it.each([
    ['incidents without a range', '/incidents'],
    ['incidents over a reversed range', `/incidents?from=${at('10:00:00')}&to=${at('09:00:00')}`],
    ['culprits over 0 days', '/culprits?days=0'],
    ['culprits over 91 days', '/culprits?days=91'],
    ['culprits with an injected day count', "/culprits?days=7'%20OR%201=1"],
    ['a timeline without a date', '/timeline'],
    ['a timeline for a date before 2000', '/timeline?date=1999-12-31'],
    ['a timeline for an impossible date', '/timeline?date=2026-02-30'],
  ])('rejects %s with 400', async (_case, url) => {
    subject = createTestService();

    const response = await subject.service.app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
  });
});
