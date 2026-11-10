import { parseRows, pgArray, toPgText, unnest } from '@yoman/service-kit/sql';
import { KnownApp } from '@yoman/shared/focus';
import { type Kysely, sql } from 'kysely';
import { z } from 'zod';

import type { FocusDatabase, KnownAppsTable } from './database.js';

type Db = Kysely<FocusDatabase>;

const InsertedRow = z.object({ inserted: z.boolean() });

export async function listKnownApps(db: Db, limit: number): Promise<KnownApp[]> {
  return parseRows(
    KnownApp,
    await db
      .selectFrom('known_apps')
      .select(['app_id as appId', 'name', 'source'])
      .orderBy('app_id')
      .limit(limit)
      .execute(),
  );
}

/**
 * Inserts new apps and refreshes known ones; a report without a name keeps
 * the one already stored. `xmax = 0` holds only for rows this statement
 * inserted, which is how the new ones are counted. The ids must be unique.
 */
export async function saveKnownApps(db: Db, apps: readonly KnownApp[]): Promise<number> {
  if (apps.length === 0) {
    return 0;
  }
  const rows = parseRows(
    InsertedRow,
    await db
      .insertInto('known_apps')
      .columns(['app_id', 'name', 'source'])
      .expression((eb) =>
        eb
          .selectFrom(
            unnest<Omit<KnownAppsTable, 'first_seen_at'>, 't'>('t', {
              app_id: pgArray(
                'text',
                apps.map((app) => app.appId),
              ),
              name: pgArray(
                'text',
                apps.map((app) => toPgText(app.name)),
              ),
              source: pgArray(
                'text',
                apps.map((app) => app.source),
              ),
            }),
          )
          .selectAll(),
      )
      .onConflict((conflict) =>
        conflict.column('app_id').doUpdateSet((eb) => ({
          name: eb.fn.coalesce('excluded.name', 'known_apps.name'),
          source: eb.ref('excluded.source'),
        })),
      )
      .returning(sql<boolean>`(xmax = 0)`.as('inserted'))
      .execute(),
  );
  return rows.filter((row) => row.inserted).length;
}
