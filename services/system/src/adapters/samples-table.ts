import type { PressureSample, ProcessSample } from '@yoman/shared/ingest';
import type { PressurePoint } from '@yoman/shared/system';
import { z } from 'zod';

import type { ProcessPeak } from '../domain/culprits.js';
import type { RssPoint } from '../domain/memory-leak.js';
import { type ProcessKey, processKey } from '../use-cases/store.js';
import { type Queryable, selectRows } from './sql.js';

/** `bigint` columns and aggregates come back from `pg` as strings. */
const BigintNumber = z.coerce.number().int().min(0);

const PeakRow = z.object({
  pid: z.number().int(),
  comm: z.string(),
  container: z.string().nullable(),
  cpu_pct: z.number(),
  rss_bytes: BigintNumber,
  io_bytes_per_sec: BigintNumber,
});

const HistoryRow = z.object({
  pid: z.number().int(),
  comm: z.string(),
  ts: z.date(),
  rss_bytes: BigintNumber,
});

const PointRow = z.object({
  ts: z.date(),
  cpu: z.number(),
  memory: z.number(),
  io: z.number(),
});

export async function insertPressure(
  db: Queryable,
  samples: readonly PressureSample[],
): Promise<void> {
  if (samples.length === 0) {
    return;
  }
  await db.query(
    `INSERT INTO pressure_samples (ts, cpu_some, cpu_full, memory_some, memory_full,
       io_some, io_full, mem_available_pct, swap_active)
     SELECT * FROM unnest($1::timestamptz[], $2::float8[], $3::float8[], $4::float8[],
       $5::float8[], $6::float8[], $7::float8[], $8::float8[], $9::boolean[])
     ON CONFLICT (ts) DO NOTHING`,
    [
      samples.map((sample) => sample.ts),
      samples.map((sample) => sample.cpu.some),
      samples.map((sample) => sample.cpu.full),
      samples.map((sample) => sample.memory.some),
      samples.map((sample) => sample.memory.full),
      samples.map((sample) => sample.io.some),
      samples.map((sample) => sample.io.full),
      samples.map((sample) => sample.memAvailablePct),
      samples.map((sample) => sample.swapActive),
    ],
  );
}

export async function insertProcesses(
  db: Queryable,
  samples: readonly ProcessSample[],
): Promise<void> {
  const rows = samples.flatMap((sample) =>
    sample.processes.map((process) => ({ ts: sample.ts, ...process })),
  );
  if (rows.length === 0) {
    return;
  }
  await db.query(
    `INSERT INTO process_snapshots (ts, pid, comm, container, cpu_pct, rss_bytes, io_bytes_per_sec)
     SELECT * FROM unnest($1::timestamptz[], $2::int[], $3::text[], $4::text[], $5::float8[],
       $6::bigint[], $7::bigint[])`,
    [
      rows.map((row) => row.ts),
      rows.map((row) => row.pid),
      rows.map((row) => row.comm),
      rows.map((row) => row.container ?? null),
      rows.map((row) => row.cpuPct),
      rows.map((row) => row.rssBytes),
      rows.map((row) => row.ioBytesPerSec),
    ],
  );
}

export async function processPeaks(
  db: Queryable,
  startMs: number,
  endMs: number,
): Promise<ProcessPeak[]> {
  const rows = await selectRows(
    db,
    PeakRow,
    `SELECT pid, comm, (array_agg(container ORDER BY ts DESC))[1] AS container,
       max(cpu_pct) AS cpu_pct, max(rss_bytes) AS rss_bytes,
       max(io_bytes_per_sec) AS io_bytes_per_sec
     FROM process_snapshots WHERE ts BETWEEN $1 AND $2 GROUP BY pid, comm`,
    [new Date(startMs), new Date(endMs)],
  );
  return rows.map((row) => ({
    pid: row.pid,
    comm: row.comm,
    container: row.container,
    cpuPct: row.cpu_pct,
    rssBytes: row.rss_bytes,
    ioBytesPerSec: row.io_bytes_per_sec,
  }));
}

export async function rssHistory(
  db: Queryable,
  keys: readonly ProcessKey[],
  startMs: number,
  endMs: number,
): Promise<Map<string, RssPoint[]>> {
  const history = new Map<string, RssPoint[]>();
  if (keys.length === 0) {
    return history;
  }
  const rows = await selectRows(
    db,
    HistoryRow,
    `SELECT s.pid, s.comm, s.ts, s.rss_bytes FROM process_snapshots s
     JOIN unnest($1::int[], $2::text[]) AS k(pid, comm) ON s.pid = k.pid AND s.comm = k.comm
     WHERE s.ts BETWEEN $3 AND $4 ORDER BY s.ts`,
    [keys.map((key) => key.pid), keys.map((key) => key.comm), new Date(startMs), new Date(endMs)],
  );
  for (const row of rows) {
    const key = processKey(row);
    const points = history.get(key) ?? [];
    points.push({ tsMs: row.ts.getTime(), rssBytes: row.rss_bytes });
    history.set(key, points);
  }
  return history;
}

export async function pruneBefore(db: Queryable, cutoffMs: number): Promise<void> {
  const cutoff = new Date(cutoffMs);
  await db.query('DELETE FROM pressure_samples WHERE ts < $1', [cutoff]);
  await db.query('DELETE FROM process_snapshots WHERE ts < $1', [cutoff]);
}

export async function pressurePoints(
  db: Queryable,
  startMs: number,
  endMs: number,
  limit: number,
): Promise<PressurePoint[]> {
  const rows = await selectRows(
    db,
    PointRow,
    `SELECT ts, cpu_some AS cpu, memory_some AS memory, io_some AS io FROM pressure_samples
     WHERE ts >= $1 AND ts < $2 ORDER BY ts LIMIT $3`,
    [new Date(startMs), new Date(endMs), limit],
  );
  return rows.map((row) => ({
    ts: row.ts.toISOString(),
    cpu: row.cpu,
    memory: row.memory,
    io: row.io,
  }));
}
