import { describe, expect, it } from 'vitest';

import {
  insertPressure,
  insertProcesses,
  pressurePoints,
  processPeaks,
  pruneBefore,
  rssHistory,
} from '../../src/adapters/samples-table.js';
import { at, pressure, process, processes } from '../samples.js';
import { fakeDb } from './fake-db.js';

const T0 = new Date(at('09:00:00'));
const T1 = new Date(at('09:05:00'));
const PID = 42;
const RSS = 2_147_483_648;
const LIMIT = 10;
/** ts, pid, comm and container: the columns a missing container shows in. */
const IDENTITY_COLUMNS = 4;

describe('samples table', () => {
  it('skips the round trip for nothing to insert', async () => {
    const db = fakeDb();

    await insertPressure(db, []);
    await insertProcesses(db, [processes('09:00:00', [])]);

    expect(db.queries).toEqual([]);
  });

  it('inserts pressure samples as one parameterized statement', async () => {
    const db = fakeDb();

    await insertPressure(db, [pressure('09:00:00', 1), pressure('09:00:05', 2)]);

    expect(db.queries).toHaveLength(1);
    expect(db.queries[0]?.values[0]).toEqual([at('09:00:00'), at('09:00:05')]);
    expect(db.queries[0]?.values[1]).toEqual([1, 2]);
  });

  it('inserts every process of every sample, a missing container as null', async () => {
    const db = fakeDb();

    await insertProcesses(db, [
      processes('09:00:00', [process(1), process(2, { container: 'yoman-web-1' })]),
    ]);

    expect(db.queries[0]?.values.slice(0, IDENTITY_COLUMNS)).toEqual([
      [at('09:00:00'), at('09:00:00')],
      [1, 2],
      ['proc1', 'proc2'],
      [null, 'yoman-web-1'],
    ]);
  });

  it('reads process peaks, bigint columns included', async () => {
    const db = fakeDb(() => [
      {
        pid: PID,
        comm: 'node',
        container: null,
        cpu_pct: 97.5,
        rss_bytes: String(RSS),
        io_bytes_per_sec: '0',
      },
    ]);

    const peaks = await processPeaks(db, T0.getTime(), T1.getTime());

    expect(db.queries[0]?.values).toEqual([T0, T1]);
    expect(peaks).toEqual([
      { pid: PID, comm: 'node', container: null, cpuPct: 97.5, rssBytes: RSS, ioBytesPerSec: 0 },
    ]);
  });

  it('groups RSS history by process', async () => {
    const db = fakeDb(() => [
      { pid: PID, comm: 'node', ts: T0, rss_bytes: '1' },
      { pid: PID, comm: 'node', ts: T1, rss_bytes: '2' },
    ]);

    const history = await rssHistory(db, [{ pid: PID, comm: 'node' }], T0.getTime(), T1.getTime());

    expect(history.get(`${PID}:node`)).toEqual([
      { tsMs: T0.getTime(), rssBytes: 1 },
      { tsMs: T1.getTime(), rssBytes: 2 },
    ]);
  });

  it('asks for no history without processes', async () => {
    const db = fakeDb();

    expect(await rssHistory(db, [], T0.getTime(), T1.getTime())).toEqual(new Map());
    expect(db.queries).toEqual([]);
  });

  it('prunes samples and snapshots before the cutoff', async () => {
    const db = fakeDb();

    await pruneBefore(db, T0.getTime());

    expect(db.queries.map((query) => query.values)).toEqual([[T0], [T0]]);
  });

  it('reads pressure points as ISO timestamps', async () => {
    const db = fakeDb(() => [{ ts: T0, cpu: 1, memory: 2, io: 3 }]);

    const points = await pressurePoints(db, T0.getTime(), T1.getTime(), LIMIT);

    expect(db.queries[0]?.values).toEqual([T0, T1, LIMIT]);
    expect(points).toEqual([{ ts: at('09:00:00'), cpu: 1, memory: 2, io: 3 }]);
  });
});
