import { asText, parseRow, parseRows, pgArray, unnest } from '@yoman/service-kit/sql';
import { type Kysely, sql } from 'kysely';
import { z } from 'zod';

import type { DayUsage } from '../domain/evaluate-goals.js';
import type { GoalsDatabase } from './database.js';

type Db = Kysely<GoalsDatabase>;

/** Any fixed number works; it only has to be the same in every transaction that evaluates. */
const EVALUATION_LOCK_KEY = 15;

/** Dates are read as text: pg would turn a `date` into a `Date` at local midnight. */
const DateRow = z.object({ date: z.iso.date().nullable() });
const UsageRow = z.object({
  target_kind: z.enum(['app', 'category']),
  target: z.string(),
  seconds: z.number().int().min(0),
});

export async function lockEvaluation(db: Db): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(${EVALUATION_LOCK_KEY})`.execute(db);
}

export async function latestEvaluatedDate(db: Db): Promise<string | null> {
  const row = parseRow(
    DateRow,
    await db
      .selectFrom('evaluation_watermark')
      .select(asText('latest_date', 'date'))
      .executeTakeFirst(),
  );
  return row?.date ?? null;
}

export async function usageOn(db: Db, date: string): Promise<DayUsage> {
  const rows = parseRows(
    UsageRow,
    await db
      .selectFrom('daily_usage')
      .select(['target_kind', 'target', 'seconds'])
      .where('date', '=', date)
      .execute(),
  );
  const pick = (kind: 'app' | 'category'): Map<string, number> =>
    new Map(rows.filter((row) => row.target_kind === kind).map((row) => [row.target, row.seconds]));
  return { apps: pick('app'), categories: pick('category') };
}

/** Replaces the day's totals and moves the watermark forward, never back. */
export async function saveUsage(db: Db, date: string, usage: DayUsage): Promise<void> {
  const entries = [
    ...[...usage.apps].map(([target, seconds]) => ['app', target, seconds] as const),
    ...[...usage.categories].map(([target, seconds]) => ['category', target, seconds] as const),
  ];
  await db.deleteFrom('daily_usage').where('date', '=', date).execute();
  await db
    .insertInto('daily_usage')
    .columns(['date', 'target_kind', 'target', 'seconds'])
    .expression((eb) =>
      eb
        .selectFrom(
          unnest<{ kind: string; target: string; seconds: number }, 't'>('t', {
            kind: pgArray(
              'text',
              entries.map(([kind]) => kind),
            ),
            target: pgArray(
              'text',
              entries.map(([, target]) => target),
            ),
            seconds: pgArray(
              'integer',
              entries.map(([, , seconds]) => seconds),
            ),
          }),
        )
        .select([sql<string>`${date}::date`.as('date'), 't.kind', 't.target', 't.seconds']),
    )
    .execute();
  await db
    .insertInto('evaluation_watermark')
    .values({ latest_date: date })
    .onConflict((conflict) =>
      conflict.column('id').doUpdateSet({
        latest_date: sql<string>`GREATEST(evaluation_watermark.latest_date, ${date}::date)`,
      }),
    )
    .execute();
}
