import { z } from 'zod';

import type { CountedSessionKey } from '../use-cases/store.js';
import { type Queryable, selectRows } from './sql.js';

const IdRow = z.object({ id: z.string() });

/** Inserts the ids not stored yet and returns exactly those: the sessions to count. */
export async function markCounted(
  db: Queryable,
  sessions: readonly CountedSessionKey[],
): Promise<Set<string>> {
  const rows = await selectRows(
    db,
    IdRow,
    `INSERT INTO counted_sessions (id, end_at)
     SELECT * FROM unnest($1::uuid[], $2::timestamptz[])
     ON CONFLICT (id) DO NOTHING RETURNING id`,
    [sessions.map((session) => session.id), sessions.map((session) => new Date(session.endMs))],
  );
  return new Set(rows.map((row) => row.id));
}
