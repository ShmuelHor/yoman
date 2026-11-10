import { asText, parseRows, pgArray, unnest } from '@yoman/service-kit/sql';
import { type Kysely, sql } from 'kysely';
import { z } from 'zod';

import type { LocalDateString } from '../domain/local-time.js';
import type { RollupEntry } from '../domain/rollup.js';
import type { ReportsDatabase } from './database.js';

type Db = Kysely<ReportsDatabase>;

/** `day` comes back as text: a `date` turned into a JS `Date` would shift with the server's zone. */
const RollupRow = z.object({
  day: z.iso.date(),
  app_id: z.string(),
  category: z.string().nullable(),
  active_ms: z.number().int().min(0),
});

interface RollupBatchRow {
  readonly day: string;
  readonly app_id: string;
  readonly category: string | null;
  readonly active_ms: number;
}

/**
 * Adds each entry's time to its row. The entries carry unique keys (see
 * `rollUp`), as one upsert statement may touch a row only once.
 */
export async function addToRollups(db: Db, entries: readonly RollupEntry[]): Promise<void> {
  await db
    .insertInto('daily_rollups')
    .columns(['day', 'app_id', 'category', 'active_ms'])
    .expression((eb) =>
      eb
        .selectFrom(
          unnest<RollupBatchRow, 't'>('t', {
            day: pgArray(
              'date',
              entries.map((entry) => entry.date),
            ),
            app_id: pgArray(
              'text',
              entries.map((entry) => entry.appId),
            ),
            category: pgArray(
              'text',
              entries.map((entry) => entry.category),
            ),
            active_ms: pgArray(
              'bigint',
              entries.map((entry) => entry.ms),
            ),
          }),
        )
        .selectAll(),
    )
    .onConflict((conflict) =>
      conflict.columns(['day', 'app_id', 'category']).doUpdateSet({
        active_ms: sql<number>`daily_rollups.active_ms + excluded.active_ms`,
      }),
    )
    .execute();
}

export async function rollups(
  db: Db,
  from: LocalDateString,
  to: LocalDateString,
): Promise<RollupEntry[]> {
  const rows = parseRows(
    RollupRow,
    await db
      .selectFrom('daily_rollups')
      .select([
        asText('day', 'day'),
        'app_id',
        'category',
        sql<number>`active_ms::float8`.as('active_ms'),
      ])
      .where('day', '>=', from)
      .where('day', '<', to)
      .orderBy('day')
      .orderBy('app_id')
      .orderBy('category', (order) => order.nullsFirst())
      .execute(),
  );
  return rows.map((row) => ({
    date: row.day,
    appId: row.app_id,
    category: row.category,
    ms: row.active_ms,
  }));
}
