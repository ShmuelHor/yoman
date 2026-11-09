import { Goal, type GoalInput } from '@yoman/shared/goals';
import { z } from 'zod';

import { type Queryable, selectRow, selectRows } from './sql.js';

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

function goalValues(input: GoalInput): unknown[] {
  const target = input.target.kind === 'app' ? input.target.appId : input.target.category;
  return [input.type, input.target.kind, target, input.minutes, input.days];
}

export function listGoals(db: Queryable, limit: number): Promise<Goal[]> {
  return selectRows(
    db,
    GoalRow,
    'SELECT id, type, target_kind, target, minutes, days FROM goals ORDER BY created_at, id LIMIT $1',
    [limit],
  );
}

export async function countGoals(db: Queryable): Promise<number> {
  const row = await selectRow(db, CountRow, 'SELECT count(*) AS count FROM goals');
  return row?.count ?? 0;
}

export async function createGoal(db: Queryable, input: GoalInput): Promise<Goal> {
  const goal = await selectRow(
    db,
    GoalRow,
    `INSERT INTO goals (type, target_kind, target, minutes, days)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, type, target_kind, target, minutes, days`,
    goalValues(input),
  );
  if (goal === null) {
    throw new Error('INSERT returned no row');
  }
  return goal;
}

export function updateGoal(db: Queryable, id: string, input: GoalInput): Promise<Goal | null> {
  return selectRow(
    db,
    GoalRow,
    `UPDATE goals SET type = $2, target_kind = $3, target = $4, minutes = $5, days = $6
     WHERE id = $1 RETURNING id, type, target_kind, target, minutes, days`,
    [id, ...goalValues(input)],
  );
}

export async function deleteGoal(db: Queryable, id: string): Promise<boolean> {
  const row = await selectRow(db, IdRow, 'DELETE FROM goals WHERE id = $1 RETURNING id', [id]);
  return row !== null;
}
