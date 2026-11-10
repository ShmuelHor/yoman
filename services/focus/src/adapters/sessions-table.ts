import { FocusSource } from '@yoman/shared/focus';
import { z } from 'zod';

import type { FocusSession } from '../domain/focus-session.js';
import type { NewFocusSession } from '../use-cases/store.js';
import { type Queryable, selectRow } from './sql.js';

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

const COLUMNS = 'id, profile_id, source, started_at, ends_at, muted_apps';

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
export async function lock(db: Queryable): Promise<void> {
  await db.query('SELECT pg_advisory_xact_lock($1)', [FOCUS_LOCK_KEY]);
}

export async function openSession(db: Queryable): Promise<FocusSession | null> {
  const row = await selectRow(
    db,
    SessionRow,
    `SELECT ${COLUMNS} FROM focus_sessions WHERE ended_at IS NULL`,
  );
  return row === null ? null : toSession(row);
}

export async function startSession(db: Queryable, session: NewFocusSession): Promise<FocusSession> {
  const row = await selectRow(
    db,
    SessionRow,
    `INSERT INTO focus_sessions (profile_id, source, started_at, ends_at, muted_apps)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
    [
      session.profileId,
      session.source,
      new Date(session.startedAtMs),
      new Date(session.endsAtMs),
      [...session.mutedApps],
    ],
  );
  if (row === null) {
    throw new Error('INSERT returned no row');
  }
  return toSession(row);
}

export async function endSession(db: Queryable, id: string, endedAtMs: number): Promise<void> {
  await db.query('UPDATE focus_sessions SET ended_at = $2 WHERE id = $1', [
    id,
    new Date(endedAtMs),
  ]);
}
