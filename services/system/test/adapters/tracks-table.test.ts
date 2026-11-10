import { describe, expect, it } from 'vitest';

import {
  lockTracks,
  recordedUntil,
  saveTracks,
  setRecordedUntil,
} from '../../src/adapters/tracks-table.js';
import { fakeDb } from './fake-db.js';

const START = new Date('2026-11-08T09:00:00.000Z');
const LAST = new Date('2026-11-08T09:00:20.000Z');
const PEAK = 55;

describe('tracks table', () => {
  it('locks the tracks before reading them', async () => {
    const { db, queries } = fakeDb((text) =>
      text.startsWith('select')
        ? [
            { type: 'cpu', run_start: START, run_peak: PEAK, last_at: LAST },
            { type: 'io', run_start: null, run_peak: 0, last_at: null },
          ]
        : [],
    );

    const tracks = await lockTracks(db);

    expect(queries[0]?.text).toMatch(/^LOCK TABLE condition_tracks/);
    expect(tracks.get('cpu')).toEqual({
      runStartMs: START.getTime(),
      runPeak: PEAK,
      lastMs: LAST.getTime(),
    });
    expect(tracks.get('io')).toEqual({ runStartMs: null, runPeak: 0, lastMs: null });
  });

  it('upserts every track as parameter arrays', async () => {
    const { db, queries } = fakeDb();

    await saveTracks(
      db,
      new Map([
        ['cpu', { runStartMs: START.getTime(), runPeak: PEAK, lastMs: LAST.getTime() }],
        ['io', { runStartMs: null, runPeak: 0, lastMs: null }],
      ]),
    );

    expect(queries[0]?.values).toEqual([
      ['cpu', 'io'],
      [START, null],
      [PEAK, 0],
      [LAST, null],
    ]);
  });

  it('reads a missing watermark as null and writes one by kind', async () => {
    const { db, queries } = fakeDb(() => [{ kind: 'thermal', recorded_until: LAST }]);

    const marks = await recordedUntil(db);
    await setRecordedUntil(db, 'pressure', START.getTime());

    expect(marks).toEqual({ pressure: null, processes: null, thermal: LAST.getTime() });
    expect(queries[1]?.values).toEqual(['pressure', START]);
  });
});
