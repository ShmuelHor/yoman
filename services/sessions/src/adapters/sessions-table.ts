import type { TimeRangeQuery } from '@yoman/shared/common';
import type { Session } from '@yoman/shared/sessions';
import { z } from 'zod';

import type { CategorizedSubject, CategoryChange } from '../domain/categorize.js';
import type { Span } from '../domain/merge-samples.js';
import type { CategorizedSpan, StoredSpan } from '../use-cases/store.js';
import { type Queryable, selectRow, selectRows, toPgText } from './sql.js';

const SessionRow = z.object({
  id: z.string(),
  app_id: z.string(),
  start_at: z.date(),
  end_at: z.date(),
  title: z.string().nullable(),
});
type SessionRow = z.infer<typeof SessionRow>;

const SubjectRow = z.object({
  id: z.string(),
  app_id: z.string(),
  title: z.string().nullable(),
  category: z.string().nullable(),
});

const IdRow = z.object({ id: z.string() });
const WatermarkRow = z.object({ recorded_until: z.date() });

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    appId: row.app_id,
    start: row.start_at.toISOString(),
    end: row.end_at.toISOString(),
    ...(row.title === null ? {} : { title: row.title }),
  };
}

/**
 * Blocks other batches (not readers) until the transaction ends, so the open
 * session is continued by one batch at a time and never duplicated.
 */
export async function lockOpenSession(db: Queryable): Promise<Span | null> {
  await db.query('LOCK TABLE sessions IN SHARE ROW EXCLUSIVE MODE');
  const row = await selectRow(
    db,
    SessionRow,
    'SELECT id, app_id, start_at, end_at, title FROM sessions WHERE NOT closed',
  );
  if (row === null) {
    return null;
  }
  return {
    id: row.id,
    appId: row.app_id,
    startMs: row.start_at.getTime(),
    endMs: row.end_at.getTime(),
    title: row.title,
    closed: false,
  };
}

export async function recordedUntil(db: Queryable): Promise<number | null> {
  const row = await selectRow(db, WatermarkRow, 'SELECT recorded_until FROM sample_watermark');
  return row === null ? null : row.recorded_until.getTime();
}

export async function setRecordedUntil(db: Queryable, tsMs: number): Promise<void> {
  await db.query(
    `INSERT INTO sample_watermark (recorded_until) VALUES ($1)
     ON CONFLICT (id) DO UPDATE SET recorded_until = EXCLUDED.recorded_until`,
    [new Date(tsMs)],
  );
}

async function insertSpan(db: Queryable, span: CategorizedSpan): Promise<string> {
  const row = await selectRow(
    db,
    IdRow,
    `INSERT INTO sessions (app_id, start_at, end_at, title, category, closed)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      span.appId,
      new Date(span.startMs),
      new Date(span.endMs),
      span.title,
      span.category,
      span.closed,
    ],
  );
  if (row === null) {
    throw new Error('INSERT returned no row');
  }
  return row.id;
}

async function updateSpan(db: Queryable, id: string, span: CategorizedSpan): Promise<void> {
  await db.query(
    'UPDATE sessions SET end_at = $2, title = $3, category = $4, closed = $5 WHERE id = $1',
    [id, new Date(span.endMs), span.title, span.category, span.closed],
  );
}

/**
 * In order: a closed span must be written before the next one opens (one open
 * at most). The result holds the title as stored, so the reply matches the row.
 */
export async function saveSpans(
  db: Queryable,
  spans: readonly CategorizedSpan[],
): Promise<StoredSpan[]> {
  const saved: StoredSpan[] = [];
  for (const original of spans) {
    const span = { ...original, title: toPgText(original.title) };
    if (span.id === null) {
      saved.push({ ...span, id: await insertSpan(db, span) });
    } else {
      await updateSpan(db, span.id, span);
      saved.push({ ...span, id: span.id });
    }
  }
  return saved;
}

/** Sessions overlapping `[from, to)`. An open session counts up to its last sample. */
export async function listSessions(
  db: Queryable,
  range: TimeRangeQuery,
  limit: number,
): Promise<Session[]> {
  const rows = await selectRows(
    db,
    SessionRow,
    `SELECT id, app_id, start_at, end_at, title FROM sessions
     WHERE start_at < $2 AND end_at >= $1 ORDER BY start_at, id LIMIT $3`,
    [range.from, range.to, limit],
  );
  return rows.map(toSession);
}

export async function sessionsEndingSince(
  db: Queryable,
  cutoff: Date,
): Promise<CategorizedSubject[]> {
  const rows = await selectRows(
    db,
    SubjectRow,
    'SELECT id, app_id, title, category FROM sessions WHERE end_at >= $1',
    [cutoff],
  );
  return rows.map((row) => ({
    id: row.id,
    wmClass: row.app_id,
    title: row.title,
    category: row.category,
  }));
}

export async function setCategories(
  db: Queryable,
  changes: readonly CategoryChange[],
): Promise<void> {
  await db.query(
    `UPDATE sessions AS s SET category = c.category
     FROM unnest($1::uuid[], $2::text[]) AS c(id, category) WHERE s.id = c.id`,
    [changes.map((change) => change.id), changes.map((change) => change.category)],
  );
}
