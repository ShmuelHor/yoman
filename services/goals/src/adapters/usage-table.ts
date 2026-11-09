import { z } from 'zod';

import type { DayUsage } from '../domain/evaluate-goals.js';
import { type Queryable, selectRow, selectRows } from './sql.js';

/** Any fixed number works; it only has to be the same in every transaction that evaluates. */
const EVALUATION_LOCK_KEY = 15;

/** Dates are read as text: pg would turn a `date` into a `Date` at local midnight. */
const DateRow = z.object({ date: z.iso.date().nullable() });
const UsageRow = z.object({
  target_kind: z.enum(['app', 'category']),
  target: z.string(),
  seconds: z.number().int().min(0),
});

export async function lockEvaluation(db: Queryable): Promise<void> {
  await db.query('SELECT pg_advisory_xact_lock($1)', [EVALUATION_LOCK_KEY]);
}

export async function latestEvaluatedDate(db: Queryable): Promise<string | null> {
  const row = await selectRow(
    db,
    DateRow,
    'SELECT latest_date::text AS date FROM evaluation_watermark',
  );
  return row?.date ?? null;
}

export async function usageOn(db: Queryable, date: string): Promise<DayUsage> {
  const rows = await selectRows(
    db,
    UsageRow,
    'SELECT target_kind, target, seconds FROM daily_usage WHERE date = $1',
    [date],
  );
  const pick = (kind: 'app' | 'category'): Map<string, number> =>
    new Map(rows.filter((row) => row.target_kind === kind).map((row) => [row.target, row.seconds]));
  return { apps: pick('app'), categories: pick('category') };
}

/** Replaces the day's totals and moves the watermark forward, never back. */
export async function saveUsage(db: Queryable, date: string, usage: DayUsage): Promise<void> {
  const entries = [
    ...[...usage.apps].map(([target, seconds]) => ['app', target, seconds] as const),
    ...[...usage.categories].map(([target, seconds]) => ['category', target, seconds] as const),
  ];
  await db.query('DELETE FROM daily_usage WHERE date = $1', [date]);
  await db.query(
    `INSERT INTO daily_usage (date, target_kind, target, seconds)
     SELECT $1::date, t.kind, t.target, t.seconds
     FROM unnest($2::text[], $3::text[], $4::integer[]) AS t(kind, target, seconds)`,
    [
      date,
      entries.map(([kind]) => kind),
      entries.map(([, target]) => target),
      entries.map(([, , seconds]) => seconds),
    ],
  );
  await db.query(
    `INSERT INTO evaluation_watermark (latest_date) VALUES ($1)
     ON CONFLICT (id) DO UPDATE SET latest_date = GREATEST(evaluation_watermark.latest_date, $1)`,
    [date],
  );
}
