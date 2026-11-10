import { parseRow, parseRows } from '@yoman/service-kit/sql';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import { Schedule, type ScheduleInput } from '../contracts.js';
import type { FocusDatabase } from './database.js';

type Db = Kysely<FocusDatabase>;

/** `count(*)` is a bigint, which pg returns as a string. */
const CountRow = z.object({ count: z.coerce.number().int().min(0) });
const IdRow = z.object({ id: z.string() });

const COLUMNS = [
  'id',
  'profile_id as profileId',
  'days',
  'start_at as start',
  'end_at as end',
  'enabled',
] as const;

function scheduleValues(input: ScheduleInput): {
  profile_id: string;
  days: number[];
  start_at: string;
  end_at: string;
  enabled: boolean;
} {
  return {
    profile_id: input.profileId,
    days: [...input.days],
    start_at: input.start,
    end_at: input.end,
    enabled: input.enabled,
  };
}

export async function listSchedules(db: Db, limit: number): Promise<Schedule[]> {
  return parseRows(
    Schedule,
    await db
      .selectFrom('schedules')
      .select(COLUMNS)
      .orderBy('created_at')
      .orderBy('id')
      .limit(limit)
      .execute(),
  );
}

export async function countSchedules(db: Db): Promise<number> {
  const row = parseRow(
    CountRow,
    await db
      .selectFrom('schedules')
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirst(),
  );
  return row?.count ?? 0;
}

export async function createSchedule(db: Db, input: ScheduleInput): Promise<Schedule> {
  const schedule = parseRow(
    Schedule,
    await db
      .insertInto('schedules')
      .values(scheduleValues(input))
      .returning(COLUMNS)
      .executeTakeFirst(),
  );
  if (schedule === null) {
    throw new Error('INSERT returned no row');
  }
  return schedule;
}

export async function updateSchedule(
  db: Db,
  id: string,
  input: ScheduleInput,
): Promise<Schedule | null> {
  return parseRow(
    Schedule,
    await db
      .updateTable('schedules')
      .set(scheduleValues(input))
      .where('id', '=', id)
      .returning(COLUMNS)
      .executeTakeFirst(),
  );
}

export async function deleteSchedule(db: Db, id: string): Promise<boolean> {
  const row = parseRow(
    IdRow,
    await db.deleteFrom('schedules').where('id', '=', id).returning('id').executeTakeFirst(),
  );
  return row !== null;
}
