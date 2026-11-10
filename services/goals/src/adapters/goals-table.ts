import { parseRow, parseRows } from '@yoman/service-kit/sql';
import { Goal, type GoalInput } from '@yoman/shared/goals';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import type { GoalsDatabase } from './database.js';

type Db = Kysely<GoalsDatabase>;

/** A stored goal, folded back into the contract's shape and checked against it. */
const GoalRow = z
  .object({
    id: z.string(),
    type: z.string(),
    target_kind: z.enum(['app', 'category']),
    target: z.string(),
    minutes: z.number(),
    days: z.array(z.number()),
  })
  .transform(({ target_kind, target, ...goal }) => ({
    ...goal,
    target:
      target_kind === 'app'
        ? { kind: target_kind, appId: target }
        : { kind: target_kind, category: target },
  }))
  .pipe(Goal);

/** `count(*)` is a bigint, which pg returns as a string. */
const CountRow = z.object({ count: z.coerce.number().int().min(0) });
const IdRow = z.object({ id: z.string() });

const COLUMNS = ['id', 'type', 'target_kind', 'target', 'minutes', 'days'] as const;

function goalValues(input: GoalInput): {
  type: string;
  target_kind: string;
  target: string;
  minutes: number;
  days: number[];
} {
  return {
    type: input.type,
    target_kind: input.target.kind,
    target: input.target.kind === 'app' ? input.target.appId : input.target.category,
    minutes: input.minutes,
    days: [...input.days],
  };
}

export async function listGoals(db: Db, limit: number): Promise<Goal[]> {
  return parseRows(
    GoalRow,
    await db
      .selectFrom('goals')
      .select(COLUMNS)
      .orderBy('created_at')
      .orderBy('id')
      .limit(limit)
      .execute(),
  );
}

export async function countGoals(db: Db): Promise<number> {
  const row = parseRow(
    CountRow,
    await db
      .selectFrom('goals')
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirst(),
  );
  return row?.count ?? 0;
}

export async function createGoal(db: Db, input: GoalInput): Promise<Goal> {
  const goal = parseRow(
    GoalRow,
    await db.insertInto('goals').values(goalValues(input)).returning(COLUMNS).executeTakeFirst(),
  );
  if (goal === null) {
    throw new Error('INSERT returned no row');
  }
  return goal;
}

export async function updateGoal(db: Db, id: string, input: GoalInput): Promise<Goal | null> {
  return parseRow(
    GoalRow,
    await db
      .updateTable('goals')
      .set(goalValues(input))
      .where('id', '=', id)
      .returning(COLUMNS)
      .executeTakeFirst(),
  );
}

export async function deleteGoal(db: Db, id: string): Promise<boolean> {
  const row = parseRow(
    IdRow,
    await db.deleteFrom('goals').where('id', '=', id).returning('id').executeTakeFirst(),
  );
  return row !== null;
}
