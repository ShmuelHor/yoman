import { describe, expect, it } from 'vitest';
import { listCulprits } from '../../src/use-cases/list-culprits.js';
import type { StoredIncident } from '../../src/use-cases/store.js';
import { systemTimeline } from '../../src/use-cases/system-timeline.js';
import { createMemoryStore } from '../memory-store.js';
import { at, pressure } from '../samples.js';

const NOW_MS = Date.parse('2026-11-08T10:00:00.000Z');
const DAY_MS = 86_400_000;
const HALF_DAY_AGO = NOW_MS - DAY_MS / 2;
const QUARTER_DAY_MS = 21_600_000;
const THREE_DAYS_MS = 259_200_000;
const QUARTER_DAY_AGO = NOW_MS - QUARTER_DAY_MS;
const DAYS_AGO_3 = NOW_MS - THREE_DAYS_MS;
const MANY = 600;
const LIST_SIZE = 500;
const UUID_TAIL_LENGTH = 12;
const CPU_SOME = 7;

function incident(id: number, startMs: number, comm: string): StoredIncident {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(UUID_TAIL_LENGTH, '0')}`,
    type: 'cpu',
    startMs,
    endMs: startMs + 1,
    peak: 50,
    culprits: [{ pid: 1, comm, container: null, cpuPct: 90, rssBytes: 1 }],
    pid: null,
  };
}

describe('listCulprits', () => {
  it('counts incidents per process over the last days, most first', async () => {
    const seed: [startMs: number, comm: string][] = [
      [HALF_DAY_AGO, 'node'],
      [QUARTER_DAY_AGO, 'node'],
      [QUARTER_DAY_AGO, 'java'],
      [DAYS_AGO_3, 'java'],
    ];
    const store = createMemoryStore({
      incidents: seed.map(([startMs, comm], index) => incident(index, startMs, comm)),
    });

    const culprits = await listCulprits(store, 1, NOW_MS);

    expect(culprits).toEqual([
      { comm: 'node', container: null, incidents: 2 },
      { comm: 'java', container: null, incidents: 1 },
    ]);
  });

  it('caps a count at the contract bound', async () => {
    const incidents = Array.from({ length: MANY }, (_, index) =>
      incident(index, NOW_MS - 1, 'node'),
    );

    const culprits = await listCulprits(createMemoryStore({ incidents }), 1, NOW_MS);

    expect(culprits).toEqual([{ comm: 'node', container: null, incidents: LIST_SIZE }]);
  });
});

describe('systemTimeline', () => {
  it('returns the samples and incidents of one local day', async () => {
    const store = createMemoryStore({
      pressure: [
        pressure('21:59:55', 1, { ts: '2026-11-07T21:59:55.000Z' }),
        pressure('09:00:00', CPU_SOME),
        pressure('22:00:00', 1),
      ],
      incidents: [incident(1, Date.parse(at('08:00:00')), 'node')],
    });

    const timeline = await systemTimeline(store, '2026-11-08', 'Asia/Jerusalem');

    expect(timeline.date).toBe('2026-11-08');
    expect(timeline.points).toEqual([{ ts: at('09:00:00'), cpu: CPU_SOME, memory: 1, io: 1 }]);
    expect(timeline.incidents.map((item) => item.id)).toEqual([incident(1, 0, '').id]);
  });
});
