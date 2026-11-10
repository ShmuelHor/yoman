import { parseRows, pgArray, unnest } from '@yoman/service-kit/sql';
import type { PressureSample, ProcessSample } from '@yoman/shared/ingest';
import type { PressurePoint } from '@yoman/shared/system';
import { type Kysely, sql } from 'kysely';
import { z } from 'zod';

import type { ProcessPeak } from '../domain/culprits.js';
import type { RssPoint } from '../domain/memory-leak.js';
import { type ProcessKey, processKey } from '../use-cases/store.js';
import type { PressureSamplesTable, SystemDatabase } from './database.js';

type Db = Kysely<SystemDatabase>;

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

interface ProcessBatchRow {
  readonly ts: string;
  readonly pid: number;
  readonly comm: string;
  readonly container: string | null;
  readonly cpu_pct: number;
  readonly rss_bytes: number;
  readonly io_bytes_per_sec: number;
}

export async function insertPressure(db: Db, samples: readonly PressureSample[]): Promise<void> {
  if (samples.length === 0) {
    return;
  }
  await db
    .insertInto('pressure_samples')
    .columns([
      'ts',
      'cpu_some',
      'cpu_full',
      'memory_some',
      'memory_full',
      'io_some',
      'io_full',
      'mem_available_pct',
      'swap_active',
    ])
    .expression((eb) =>
      eb
        .selectFrom(
          unnest<PressureSamplesTable, 't'>('t', {
            ts: pgArray(
              'timestamptz',
              samples.map((sample) => sample.ts),
            ),
            cpu_some: pgArray(
              'float8',
              samples.map((sample) => sample.cpu.some),
            ),
            cpu_full: pgArray(
              'float8',
              samples.map((sample) => sample.cpu.full),
            ),
            memory_some: pgArray(
              'float8',
              samples.map((sample) => sample.memory.some),
            ),
            memory_full: pgArray(
              'float8',
              samples.map((sample) => sample.memory.full),
            ),
            io_some: pgArray(
              'float8',
              samples.map((sample) => sample.io.some),
            ),
            io_full: pgArray(
              'float8',
              samples.map((sample) => sample.io.full),
            ),
            mem_available_pct: pgArray(
              'float8',
              samples.map((sample) => sample.memAvailablePct),
            ),
            swap_active: pgArray(
              'boolean',
              samples.map((sample) => sample.swapActive),
            ),
          }),
        )
        .selectAll(),
    )
    .onConflict((conflict) => conflict.column('ts').doNothing())
    .execute();
}

/** Up to 30 processes per sample: unnest keeps the parameter count at seven for any batch. */
export async function insertProcesses(db: Db, samples: readonly ProcessSample[]): Promise<void> {
  const rows = samples.flatMap((sample) =>
    sample.processes.map((process) => ({ ts: sample.ts, ...process })),
  );
  if (rows.length === 0) {
    return;
  }
  await db
    .insertInto('process_snapshots')
    .columns(['ts', 'pid', 'comm', 'container', 'cpu_pct', 'rss_bytes', 'io_bytes_per_sec'])
    .expression((eb) =>
      eb
        .selectFrom(
          unnest<ProcessBatchRow, 't'>('t', {
            ts: pgArray(
              'timestamptz',
              rows.map((row) => row.ts),
            ),
            pid: pgArray(
              'integer',
              rows.map((row) => row.pid),
            ),
            comm: pgArray(
              'text',
              rows.map((row) => row.comm),
            ),
            container: pgArray(
              'text',
              rows.map((row) => row.container ?? null),
            ),
            cpu_pct: pgArray(
              'float8',
              rows.map((row) => row.cpuPct),
            ),
            rss_bytes: pgArray(
              'bigint',
              rows.map((row) => row.rssBytes),
            ),
            io_bytes_per_sec: pgArray(
              'bigint',
              rows.map((row) => row.ioBytesPerSec),
            ),
          }),
        )
        .selectAll(),
    )
    .execute();
}

export async function processPeaks(db: Db, startMs: number, endMs: number): Promise<ProcessPeak[]> {
  const rows = parseRows(
    PeakRow,
    await db
      .selectFrom('process_snapshots')
      .select((eb) => [
        'pid',
        'comm',
        sql<string | null>`(array_agg(container ORDER BY ts DESC))[1]`.as('container'),
        eb.fn.max('cpu_pct').as('cpu_pct'),
        eb.fn.max('rss_bytes').as('rss_bytes'),
        eb.fn.max('io_bytes_per_sec').as('io_bytes_per_sec'),
      ])
      .where((eb) => eb.between('ts', new Date(startMs), new Date(endMs)))
      .groupBy(['pid', 'comm'])
      .execute(),
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
  db: Db,
  keys: readonly ProcessKey[],
  startMs: number,
  endMs: number,
): Promise<Map<string, RssPoint[]>> {
  const history = new Map<string, RssPoint[]>();
  if (keys.length === 0) {
    return history;
  }
  const wanted = unnest<{ pid: number; comm: string }, 'k'>('k', {
    pid: pgArray(
      'integer',
      keys.map((key) => key.pid),
    ),
    comm: pgArray(
      'text',
      keys.map((key) => key.comm),
    ),
  });
  const rows = parseRows(
    HistoryRow,
    await db
      .selectFrom('process_snapshots as s')
      .innerJoin(wanted, (join) => join.onRef('s.pid', '=', 'k.pid').onRef('s.comm', '=', 'k.comm'))
      .select(['s.pid', 's.comm', 's.ts', 's.rss_bytes'])
      .where((eb) => eb.between('s.ts', new Date(startMs), new Date(endMs)))
      .orderBy('s.ts')
      .execute(),
  );
  for (const row of rows) {
    const key = processKey(row);
    const points = history.get(key) ?? [];
    points.push({ tsMs: row.ts.getTime(), rssBytes: row.rss_bytes });
    history.set(key, points);
  }
  return history;
}

export async function pruneBefore(db: Db, cutoffMs: number): Promise<void> {
  const cutoff = new Date(cutoffMs);
  await db.deleteFrom('pressure_samples').where('ts', '<', cutoff).execute();
  await db.deleteFrom('process_snapshots').where('ts', '<', cutoff).execute();
}

export async function pressurePoints(
  db: Db,
  startMs: number,
  endMs: number,
  limit: number,
): Promise<PressurePoint[]> {
  const rows = parseRows(
    PointRow,
    await db
      .selectFrom('pressure_samples')
      .select(['ts', 'cpu_some as cpu', 'memory_some as memory', 'io_some as io'])
      .where('ts', '>=', new Date(startMs))
      .where('ts', '<', new Date(endMs))
      .orderBy('ts')
      .limit(limit)
      .execute(),
  );
  return rows.map((row) => ({
    ts: row.ts.toISOString(),
    cpu: row.cpu,
    memory: row.memory,
    io: row.io,
  }));
}
