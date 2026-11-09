import { z } from 'zod';

import type { LocalDateString } from '../domain/local-time.js';
import type { RollupEntry } from '../domain/rollup.js';
import { type Queryable, selectRows } from './sql.js';

/** `day` comes back as text: a `date` turned into a JS `Date` would shift with the server's zone. */
const RollupRow = z.object({
  day: z.iso.date(),
  app_id: z.string(),
  category: z.string().nullable(),
  active_ms: z.number().int().min(0),
});

/**
 * Adds each entry's time to its row. The entries carry unique keys (see
 * `rollUp`), as one upsert statement may touch a row only once.
 */
export async function addToRollups(db: Queryable, entries: readonly RollupEntry[]): Promise<void> {
  await db.query(
    `INSERT INTO daily_rollups (day, app_id, category, active_ms)
     SELECT * FROM unnest($1::date[], $2::text[], $3::text[], $4::bigint[])
     ON CONFLICT (day, app_id, category)
     DO UPDATE SET active_ms = daily_rollups.active_ms + EXCLUDED.active_ms`,
    [
      entries.map((entry) => entry.date),
      entries.map((entry) => entry.appId),
      entries.map((entry) => entry.category),
      entries.map((entry) => entry.ms),
    ],
  );
}

export async function rollups(
  db: Queryable,
  from: LocalDateString,
  to: LocalDateString,
): Promise<RollupEntry[]> {
  const rows = await selectRows(
    db,
    RollupRow,
    `SELECT day::text AS day, app_id, category, active_ms::float8 AS active_ms
     FROM daily_rollups WHERE day >= $1::date AND day < $2::date
     ORDER BY day, app_id, category NULLS FIRST`,
    [from, to],
  );
  return rows.map((row) => ({
    date: row.day,
    appId: row.app_id,
    category: row.category,
    ms: row.active_ms,
  }));
}
