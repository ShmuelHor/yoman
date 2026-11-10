import { z } from 'zod';

import { Schedule, type ScheduleInput } from '../contracts.js';
import { type Queryable, selectRow, selectRows } from './sql.js';

/** `count(*)` is a bigint, which pg returns as a string. */
const CountRow = z.object({ count: z.coerce.number().int().min(0) });
const IdRow = z.object({ id: z.string() });

const COLUMNS = 'id, profile_id AS "profileId", days, start_at AS start, end_at AS "end", enabled';

function scheduleValues(input: ScheduleInput): unknown[] {
  return [input.profileId, input.days, input.start, input.end, input.enabled];
}

export function listSchedules(db: Queryable, limit: number): Promise<Schedule[]> {
  return selectRows(
    db,
    Schedule,
    `SELECT ${COLUMNS} FROM schedules ORDER BY created_at, id LIMIT $1`,
    [limit],
  );
}

export async function countSchedules(db: Queryable): Promise<number> {
  const row = await selectRow(db, CountRow, 'SELECT count(*) AS count FROM schedules');
  return row?.count ?? 0;
}

export async function createSchedule(db: Queryable, input: ScheduleInput): Promise<Schedule> {
  const schedule = await selectRow(
    db,
    Schedule,
    `INSERT INTO schedules (profile_id, days, start_at, end_at, enabled)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
    scheduleValues(input),
  );
  if (schedule === null) {
    throw new Error('INSERT returned no row');
  }
  return schedule;
}

export function updateSchedule(
  db: Queryable,
  id: string,
  input: ScheduleInput,
): Promise<Schedule | null> {
  return selectRow(
    db,
    Schedule,
    `UPDATE schedules SET profile_id = $2, days = $3, start_at = $4, end_at = $5, enabled = $6
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, ...scheduleValues(input)],
  );
}

export async function deleteSchedule(db: Queryable, id: string): Promise<boolean> {
  const row = await selectRow(db, IdRow, 'DELETE FROM schedules WHERE id = $1 RETURNING id', [id]);
  return row !== null;
}
