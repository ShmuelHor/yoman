import { parseRows, pgArray, unnest } from '@yoman/service-kit/sql';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import type { CountedSessionKey } from '../use-cases/store.js';
import type { ReportsDatabase } from './database.js';

const IdRow = z.object({ id: z.string() });

/** Inserts the ids not stored yet and returns exactly those: the sessions to count. */
export async function markCounted(
  db: Kysely<ReportsDatabase>,
  sessions: readonly CountedSessionKey[],
): Promise<Set<string>> {
  const rows = parseRows(
    IdRow,
    await db
      .insertInto('counted_sessions')
      .columns(['id', 'end_at'])
      .expression((eb) =>
        eb
          .selectFrom(
            unnest<{ id: string; end_at: Date }, 't'>('t', {
              id: pgArray(
                'uuid',
                sessions.map((session) => session.id),
              ),
              end_at: pgArray(
                'timestamptz',
                sessions.map((session) => new Date(session.endMs)),
              ),
            }),
          )
          .selectAll(),
      )
      .onConflict((conflict) => conflict.column('id').doNothing())
      .returning('id')
      .execute(),
  );
  return new Set(rows.map((row) => row.id));
}
