import { describe, expect, it } from 'vitest';

import {
  culpritCounts,
  listIncidents,
  openIncidents,
  saveIncidents,
} from '../../src/adapters/incidents-table.js';
import type { IncidentState } from '../../src/domain/incident.js';
import { at } from '../samples.js';
import { fakeDb } from './fake-db.js';

const ID = '9c4f5d2b-4e60-4f81-b2a3-cd4e5f607182';
const NEW_ID = 'ad506e3c-5f71-4092-83b4-de5f60718293';
const START = new Date(at('09:00:00'));
const END = new Date(at('09:05:00'));
const PEAK = 27.5;
const LIMIT = 500;
const culprit = { pid: 42, comm: 'node', container: null, cpuPct: 96, rssBytes: 1 };

const row = {
  id: ID,
  type: 'memory',
  start_at: START,
  end_at: null,
  peak: PEAK,
  culprits: [culprit],
  pid: null,
};

function incident(overrides: Partial<IncidentState> = {}): IncidentState {
  return {
    id: null,
    type: 'cpu',
    startMs: START.getTime(),
    endMs: null,
    peak: PEAK,
    culprits: [culprit],
    pid: null,
    ...overrides,
  };
}

describe('incidents table', () => {
  it('reads open incidents with their culprits', async () => {
    const db = fakeDb(() => [row]);

    expect(await openIncidents(db)).toEqual([
      {
        id: ID,
        type: 'memory',
        startMs: START.getTime(),
        endMs: null,
        peak: PEAK,
        culprits: [culprit],
        pid: null,
      },
    ]);
  });

  it('inserts new incidents and updates stored ones, in order', async () => {
    const db = fakeDb((text) => (text.startsWith('INSERT') ? [{ id: NEW_ID }] : []));

    const saved = await saveIncidents(db, [incident({ id: ID, endMs: END.getTime() }), incident()]);

    expect(saved.map((item) => item.id)).toEqual([ID, NEW_ID]);
    expect(db.queries.map((query) => query.text.split(' ')[0])).toEqual(['UPDATE', 'INSERT']);
    expect(db.queries[0]?.values).toEqual([ID, END, PEAK, JSON.stringify([culprit])]);
    expect(db.queries[1]?.values).toEqual([
      'cpu',
      START,
      null,
      PEAK,
      JSON.stringify([culprit]),
      null,
    ]);
  });

  it('fails loudly when an insert returns no id', async () => {
    await expect(saveIncidents(fakeDb(), [incident()])).rejects.toThrow('INSERT returned no row');
  });

  it('lists incidents in the public shape', async () => {
    const db = fakeDb(() => [{ ...row, end_at: END }]);
    const range = { from: at('08:00:00'), to: at('10:00:00') };

    const items = await listIncidents(db, range, LIMIT);

    expect(db.queries[0]?.values).toEqual([range.from, range.to, LIMIT]);
    expect(items).toEqual([
      {
        id: ID,
        type: 'memory',
        start: at('09:00:00'),
        end: at('09:05:00'),
        peak: PEAK,
        culprits: [culprit],
      },
    ]);
  });

  it('rejects a stored culprit that breaks the contract', async () => {
    const db = fakeDb(() => [{ ...row, culprits: [{ ...culprit, cmdline: 'secret' }] }]);

    await expect(openIncidents(db)).rejects.toThrow();
  });

  it('counts culprits since a moment', async () => {
    const counts = [{ comm: 'node', container: null, incidents: 3 }];
    const db = fakeDb(() => counts);

    expect(await culpritCounts(db, START.getTime(), LIMIT)).toEqual(counts);
    expect(db.queries[0]?.values).toEqual([START, LIMIT]);
  });
});
