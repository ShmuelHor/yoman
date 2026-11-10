import { parseRow } from '@yoman/service-kit/sql';
import { FocusSource } from '@yoman/shared/focus';
import { type Kysely, sql } from 'kysely';
import { z } from 'zod';

import type { FocusSession } from '../domain/focus-session.js';
import type { NewFocusSession } from '../use-cases/store.js';
import type { FocusDatabase } from './database.js';

type Db = Kysely<FocusDatabase>;

/** Any constant works; it only has to be the same for every focus writer. */
const FOCUS_LOCK_KEY = 18;

const SessionRow = z.object({
  id: z.string(),
  profile_id: z.string(),
  source: FocusSource,
  started_at: z.date(),
  ends_at: z.date(),
  muted_apps: z.array(z.string()),
});
type SessionRow = z.infer<typeof SessionRow>;

const COLUMNS = ['id', 'profile_id', 'source', 'started_at', 'ends_at', 'muted_apps'] as const;

function toSession(row: SessionRow): FocusSession {
  return {
    id: row.id,
    profileId: row.profile_id,
    source: row.source,
    startedAtMs: row.started_at.getTime(),
    endsAtMs: row.ends_at.getTime(),
    mutedApps: row.muted_apps,
  };
}

/** Blocks other writers (not readers) until the transaction ends. */
export async function lock(db: Db): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(${FOCUS_LOCK_KEY})`.execute(db);
}

export async function openSession(db: Db): Promise<FocusSession | null> {
  const row = parseRow(
    SessionRow,
    await db
      .selectFrom('focus_sessions')
      .select(COLUMNS)
      .where('ended_at', 'is', null)
      .executeTakeFirst(),
  );
  return row === null ? null : toSession(row);
}

export async function startSession(db: Db, session: NewFocusSession): Promise<FocusSession> {
  const row = parseRow(
    SessionRow,
    await db
      .insertInto('focus_sessions')
      .values({
        profile_id: session.profileId,
        source: session.source,
        started_at: new Date(session.startedAtMs),
        ends_at: new Date(session.endsAtMs),
        muted_apps: [...session.mutedApps],
      })
      .returning(COLUMNS)
      .executeTakeFirst(),
  );
  if (row === null) {
    throw new Error('INSERT returned no row');
  }
  return toSession(row);
}

export async function endSession(db: Db, id: string, endedAtMs: number): Promise<void> {
  await db
    .updateTable('focus_sessions')
    .set({ ended_at: new Date(endedAtMs) })
    .where('id', '=', id)
    .execute();
}
