import { z } from 'zod';

import type { StoredStreak, Streak } from '../domain/streaks.js';
import { type Queryable, selectRows } from './sql.js';

const StreakRow = z.object({
  id: z.string(),
  category: z.string(),
  start_at: z.date(),
  end_at: z.date(),
});
type StreakRow = z.infer<typeof StreakRow>;

function toStreak(row: StreakRow): StoredStreak {
  return {
    id: row.id,
    category: row.category,
    startMs: row.start_at.getTime(),
    endMs: row.end_at.getTime(),
  };
}

/** Streak merges read, then rewrite; one batch at a time, while readers go on. */
export async function lockStreaks(db: Queryable): Promise<void> {
  await db.query('LOCK TABLE focus_streaks IN SHARE ROW EXCLUSIVE MODE');
}

export async function streaksNear(
  db: Queryable,
  categories: readonly string[],
  fromMs: number,
  toMs: number,
): Promise<StoredStreak[]> {
  const rows = await selectRows(
    db,
    StreakRow,
    `SELECT id, category, start_at, end_at FROM focus_streaks
     WHERE category = ANY($1::text[]) AND end_at >= $2 AND start_at <= $3`,
    [[...categories], new Date(fromMs), new Date(toMs)],
  );
  return rows.map(toStreak);
}

export async function streaksStarting(
  db: Queryable,
  fromMs: number,
  toMs: number,
): Promise<StoredStreak[]> {
  const rows = await selectRows(
    db,
    StreakRow,
    `SELECT id, category, start_at, end_at FROM focus_streaks
     WHERE start_at >= $1 AND start_at < $2 ORDER BY start_at, id`,
    [new Date(fromMs), new Date(toMs)],
  );
  return rows.map(toStreak);
}

export async function replaceStreaks(
  db: Queryable,
  removed: readonly string[],
  added: readonly Streak[],
): Promise<void> {
  if (removed.length > 0) {
    await db.query('DELETE FROM focus_streaks WHERE id = ANY($1::uuid[])', [[...removed]]);
  }
  if (added.length > 0) {
    await db.query(
      `INSERT INTO focus_streaks (category, start_at, end_at)
       SELECT * FROM unnest($1::text[], $2::timestamptz[], $3::timestamptz[])`,
      [
        added.map((streak) => streak.category),
        added.map((streak) => new Date(streak.startMs)),
        added.map((streak) => new Date(streak.endMs)),
      ],
    );
  }
}
