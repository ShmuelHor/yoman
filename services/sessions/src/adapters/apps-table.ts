import { App, type AppUpdate } from '@yoman/shared/sessions';
import { z } from 'zod';

import { type Queryable, selectRow, selectRows, toPgText } from './sql.js';

const CategoryRow = z.object({ id: z.string(), category: z.string() });

/** New apps are named after their `wm_class` until the user renames them. */
export async function ensureApps(db: Queryable, ids: readonly string[]): Promise<void> {
  await db.query(
    `INSERT INTO apps (id, name) SELECT id, id FROM unnest($1::text[]) AS t(id)
     ON CONFLICT (id) DO NOTHING`,
    [[...ids]],
  );
}

export async function appCategories(db: Queryable): Promise<Map<string, string | null>> {
  const rows = await selectRows(
    db,
    CategoryRow,
    'SELECT id, category FROM apps WHERE category IS NOT NULL',
  );
  return new Map(rows.map((row) => [row.id, row.category]));
}

export function listApps(db: Queryable, limit: number): Promise<App[]> {
  return selectRows(
    db,
    App,
    `SELECT id, name, icon, category FROM apps ORDER BY name, id LIMIT $1`,
    [limit],
  );
}

export function updateApp(db: Queryable, id: string, update: AppUpdate): Promise<App | null> {
  return selectRow(
    db,
    App,
    `UPDATE apps SET name = $2, category = $3 WHERE id = $1 RETURNING id, name, icon, category`,
    [id, toPgText(update.name), update.category],
  );
}
