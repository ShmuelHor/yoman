import { parseRow, parseRows, pgArray, toPgText, unnest } from '@yoman/service-kit/sql';
import { App, type AppUpdate } from '@yoman/shared/sessions';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import type { SessionsDatabase } from './database.js';

type Db = Kysely<SessionsDatabase>;

const CategoryRow = z.object({ id: z.string(), category: z.string() });
const APP_COLUMNS = ['id', 'name', 'icon', 'category'] as const;

/** New apps are named after their `wm_class` until the user renames them. */
export async function ensureApps(db: Db, ids: readonly string[]): Promise<void> {
  await db
    .insertInto('apps')
    .columns(['id', 'name'])
    .expression((eb) =>
      eb
        .selectFrom(unnest<{ id: string }, 't'>('t', { id: pgArray('text', ids) }))
        .select(['t.id', 't.id as name']),
    )
    .onConflict((conflict) => conflict.column('id').doNothing())
    .execute();
}

export async function appCategories(db: Db): Promise<Map<string, string | null>> {
  const rows = parseRows(
    CategoryRow,
    await db
      .selectFrom('apps')
      .select(['id', 'category'])
      .where('category', 'is not', null)
      .execute(),
  );
  return new Map(rows.map((row) => [row.id, row.category]));
}

export async function listApps(db: Db, limit: number): Promise<App[]> {
  return parseRows(
    App,
    await db
      .selectFrom('apps')
      .select(APP_COLUMNS)
      .orderBy('name')
      .orderBy('id')
      .limit(limit)
      .execute(),
  );
}

export async function updateApp(db: Db, id: string, update: AppUpdate): Promise<App | null> {
  return parseRow(
    App,
    await db
      .updateTable('apps')
      .set({ name: toPgText(update.name), category: update.category })
      .where('id', '=', id)
      .returning(APP_COLUMNS)
      .executeTakeFirst(),
  );
}
