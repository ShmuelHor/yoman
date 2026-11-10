import { parseRows, pgArray, unnest } from '@yoman/service-kit/sql';
import { type Kysely, sql } from 'kysely';
import { z } from 'zod';

import type { ConditionTrack } from '../domain/condition-tracker.js';
import { CONDITION_TYPES, type ConditionType } from '../domain/conditions.js';
import type { SystemSampleKind, Watermarks } from '../domain/fresh-samples.js';
import type { SystemDatabase } from './database.js';

type Db = Kysely<SystemDatabase>;

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

interface TrackBatchRow {
  readonly type: string;
  readonly run_start: Date | null;
  readonly run_peak: number;
  readonly last_at: Date | null;
}

/**
 * Blocks other batches (not readers) until the transaction ends, so the
 * tracks, the open incidents and the watermarks move one batch at a time.
 */
export async function lockTracks(db: Db): Promise<Map<ConditionType, ConditionTrack>> {
  await sql`LOCK TABLE condition_tracks IN SHARE ROW EXCLUSIVE MODE`.execute(db);
  const rows = parseRows(
    TrackRow,
    await db
      .selectFrom('condition_tracks')
      .select(['type', 'run_start', 'run_peak', 'last_at'])
      .execute(),
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
  db: Db,
  tracks: ReadonlyMap<ConditionType, ConditionTrack>,
): Promise<void> {
  const entries = [...tracks];
  await db
    .insertInto('condition_tracks')
    .columns(['type', 'run_start', 'run_peak', 'last_at'])
    .expression((eb) =>
      eb
        .selectFrom(
          unnest<TrackBatchRow, 't'>('t', {
            type: pgArray(
              'text',
              entries.map(([type]) => type),
            ),
            run_start: pgArray(
              'timestamptz',
              entries.map(([, track]) => toDate(track.runStartMs)),
            ),
            run_peak: pgArray(
              'float8',
              entries.map(([, track]) => track.runPeak),
            ),
            last_at: pgArray(
              'timestamptz',
              entries.map(([, track]) => toDate(track.lastMs)),
            ),
          }),
        )
        .selectAll(),
    )
    .onConflict((conflict) =>
      conflict.column('type').doUpdateSet((eb) => ({
        run_start: eb.ref('excluded.run_start'),
        run_peak: eb.ref('excluded.run_peak'),
        last_at: eb.ref('excluded.last_at'),
      })),
    )
    .execute();
}

export async function recordedUntil(db: Db): Promise<Watermarks> {
  const rows = parseRows(
    WatermarkRow,
    await db.selectFrom('sample_watermarks').select(['kind', 'recorded_until']).execute(),
  );
  const mark = (kind: SystemSampleKind): number | null =>
    rows.find((row) => row.kind === kind)?.recorded_until.getTime() ?? null;
  return { pressure: mark('pressure'), processes: mark('processes'), thermal: mark('thermal') };
}

export async function setRecordedUntil(
  db: Db,
  kind: SystemSampleKind,
  tsMs: number,
): Promise<void> {
  await db
    .insertInto('sample_watermarks')
    .values({ kind, recorded_until: new Date(tsMs) })
    .onConflict((conflict) =>
      conflict
        .column('kind')
        .doUpdateSet((eb) => ({ recorded_until: eb.ref('excluded.recorded_until') })),
    )
    .execute();
}
