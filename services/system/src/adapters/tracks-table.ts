import { z } from 'zod';

import type { ConditionTrack } from '../domain/condition-tracker.js';
import { CONDITION_TYPES, type ConditionType } from '../domain/conditions.js';
import type { SystemSampleKind, Watermarks } from '../domain/fresh-samples.js';
import { type Queryable, selectRows } from './sql.js';

const TrackRow = z.object({
  type: z.enum(CONDITION_TYPES),
  run_start: z.date().nullable(),
  run_peak: z.number(),
  last_at: z.date().nullable(),
});

const WatermarkRow = z.object({
  kind: z.enum(['pressure', 'processes', 'thermal']),
  recorded_until: z.date(),
});

/**
 * Blocks other batches (not readers) until the transaction ends, so the
 * tracks, the open incidents and the watermarks move one batch at a time.
 */
export async function lockTracks(db: Queryable): Promise<Map<ConditionType, ConditionTrack>> {
  await db.query('LOCK TABLE condition_tracks IN SHARE ROW EXCLUSIVE MODE');
  const rows = await selectRows(
    db,
    TrackRow,
    'SELECT type, run_start, run_peak, last_at FROM condition_tracks',
  );
  return new Map(
    rows.map((row) => [
      row.type,
      {
        runStartMs: row.run_start?.getTime() ?? null,
        runPeak: row.run_peak,
        lastMs: row.last_at?.getTime() ?? null,
      },
    ]),
  );
}

function toDate(ms: number | null): Date | null {
  return ms === null ? null : new Date(ms);
}

export async function saveTracks(
  db: Queryable,
  tracks: ReadonlyMap<ConditionType, ConditionTrack>,
): Promise<void> {
  const entries = [...tracks];
  await db.query(
    `INSERT INTO condition_tracks (type, run_start, run_peak, last_at)
     SELECT * FROM unnest($1::text[], $2::timestamptz[], $3::float8[], $4::timestamptz[])
     ON CONFLICT (type) DO UPDATE SET run_start = EXCLUDED.run_start,
       run_peak = EXCLUDED.run_peak, last_at = EXCLUDED.last_at`,
    [
      entries.map(([type]) => type),
      entries.map(([, track]) => toDate(track.runStartMs)),
      entries.map(([, track]) => track.runPeak),
      entries.map(([, track]) => toDate(track.lastMs)),
    ],
  );
}

export async function recordedUntil(db: Queryable): Promise<Watermarks> {
  const rows = await selectRows(
    db,
    WatermarkRow,
    'SELECT kind, recorded_until FROM sample_watermarks',
  );
  const mark = (kind: SystemSampleKind): number | null =>
    rows.find((row) => row.kind === kind)?.recorded_until.getTime() ?? null;
  return { pressure: mark('pressure'), processes: mark('processes'), thermal: mark('thermal') };
}

export async function setRecordedUntil(
  db: Queryable,
  kind: SystemSampleKind,
  tsMs: number,
): Promise<void> {
  await db.query(
    `INSERT INTO sample_watermarks (kind, recorded_until) VALUES ($1, $2)
     ON CONFLICT (kind) DO UPDATE SET recorded_until = EXCLUDED.recorded_until`,
    [kind, new Date(tsMs)],
  );
}
