import { KnownApp } from '@yoman/shared/focus';
import { z } from 'zod';

import { type Queryable, selectRows, toPgText } from './sql.js';

const InsertedRow = z.object({ inserted: z.boolean() });

export function listKnownApps(db: Queryable, limit: number): Promise<KnownApp[]> {
  return selectRows(
    db,
    KnownApp,
    'SELECT app_id AS "appId", name, source FROM known_apps ORDER BY app_id LIMIT $1',
    [limit],
  );
}

/**
 * Inserts new apps and refreshes known ones; a report without a name keeps
 * the one already stored. `xmax = 0` holds only for rows this statement
 * inserted, which is how the new ones are counted. The ids must be unique.
 */
export async function saveKnownApps(db: Queryable, apps: readonly KnownApp[]): Promise<number> {
  if (apps.length === 0) {
    return 0;
  }
  const rows = await selectRows(
    db,
    InsertedRow,
    `INSERT INTO known_apps (app_id, name, source)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
     ON CONFLICT (app_id) DO UPDATE
       SET name = COALESCE(EXCLUDED.name, known_apps.name), source = EXCLUDED.source
     RETURNING (xmax = 0) AS inserted`,
    [
      apps.map((app) => app.appId),
      apps.map((app) => toPgText(app.name)),
      apps.map((app) => app.source),
    ],
  );
  return rows.filter((row) => row.inserted).length;
}
