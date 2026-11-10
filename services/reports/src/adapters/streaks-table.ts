import { parseRows, pgArray, unnest } from '@yoman/service-kit/sql';
import { type Kysely, sql } from 'kysely';
import { z } from 'zod';

import type { StoredStreak, Streak } from '../domain/streaks.js';
import type { ReportsDatabase } from './database.js';

type Db = Kysely<ReportsDatabase>;

const StreakRow = z.object({
  id: z.string(),
  category: z.string(),
  start_at: z.date(),
  end_at: z.date(),
});
type StreakRow = z.infer<typeof StreakRow>;

const COLUMNS = ['id', 'category', 'start_at', 'end_at'] as const;

function toStreak(row: StreakRow): StoredStreak {
  return {
    id: row.id,
    category: row.category,
    startMs: row.start_at.getTime(),
    endMs: row.end_at.getTime(),
  };
}

/** Streak merges read, then rewrite; one batch at a time, while readers go on. */
export async function lockStreaks(db: Db): Promise<void> {
  await sql`LOCK TABLE focus_streaks IN SHARE ROW EXCLUSIVE MODE`.execute(db);
}

export async function streaksNear(
  db: Db,
  categories: readonly string[],
  fromMs: number,
  toMs: number,
): Promise<StoredStreak[]> {
  const rows = parseRows(
    StreakRow,
    await db
      .selectFrom('focus_streaks')
      .select(COLUMNS)
      .where('category', '=', (eb) => eb.fn.any(pgArray('text', categories)))
      .where('end_at', '>=', new Date(fromMs))
      .where('start_at', '<=', new Date(toMs))
      .execute(),
  );
  return rows.map(toStreak);
}

export async function streaksStarting(
  db: Db,
  fromMs: number,
  toMs: number,
): Promise<StoredStreak[]> {
  const rows = parseRows(
    StreakRow,
    await db
      .selectFrom('focus_streaks')
      .select(COLUMNS)
      .where('start_at', '>=', new Date(fromMs))
      .where('start_at', '<', new Date(toMs))
      .orderBy('start_at')
      .orderBy('id')
      .execute(),
  );
  return rows.map(toStreak);
}

export async function replaceStreaks(
  db: Db,
  removed: readonly string[],
  added: readonly Streak[],
): Promise<void> {
  if (removed.length > 0) {
    await db
      .deleteFrom('focus_streaks')
      .where('id', '=', (eb) => eb.fn.any(pgArray('uuid', removed)))
      .execute();
  }
  if (added.length > 0) {
    await db
      .insertInto('focus_streaks')
      .columns(['category', 'start_at', 'end_at'])
      .expression((eb) =>
        eb
          .selectFrom(
            unnest<{ category: string; start_at: Date; end_at: Date }, 't'>('t', {
              category: pgArray(
                'text',
                added.map((streak) => streak.category),
              ),
              start_at: pgArray(
                'timestamptz',
                added.map((streak) => new Date(streak.startMs)),
              ),
              end_at: pgArray(
                'timestamptz',
                added.map((streak) => new Date(streak.endMs)),
              ),
            }),
          )
          .selectAll(),
      )
      .execute();
  }
}
