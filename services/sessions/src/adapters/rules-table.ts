import { Rule, type RuleInput } from '@yoman/shared/sessions';
import { z } from 'zod';

import { type Queryable, selectRow, selectRows, toPgText } from './sql.js';

/** `count(*)` is a bigint, which pg returns as a string. */
const CountRow = z.object({ count: z.coerce.number().int().min(0) });
const IdRow = z.object({ id: z.string() });

function ruleValues(input: RuleInput): unknown[] {
  return [input.field, input.match, toPgText(input.pattern), input.category, input.priority];
}

export function listRules(db: Queryable, limit: number): Promise<Rule[]> {
  return selectRows(
    db,
    Rule,
    `SELECT id, field, match_type AS match, pattern, category, priority FROM category_rules ORDER BY priority DESC, id LIMIT $1`,
    [limit],
  );
}

export async function countRules(db: Queryable): Promise<number> {
  const row = await selectRow(db, CountRow, 'SELECT count(*) AS count FROM category_rules');
  return row?.count ?? 0;
}

export async function createRule(db: Queryable, input: RuleInput): Promise<Rule> {
  const rule = await selectRow(
    db,
    Rule,
    `INSERT INTO category_rules (field, match_type, pattern, category, priority)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, field, match_type AS match, pattern, category, priority`,
    ruleValues(input),
  );
  if (rule === null) {
    throw new Error('INSERT returned no row');
  }
  return rule;
}

export function updateRule(db: Queryable, id: string, input: RuleInput): Promise<Rule | null> {
  return selectRow(
    db,
    Rule,
    `UPDATE category_rules
     SET field = $2, match_type = $3, pattern = $4, category = $5, priority = $6
     WHERE id = $1 RETURNING id, field, match_type AS match, pattern, category, priority`,
    [id, ...ruleValues(input)],
  );
}

export async function deleteRule(db: Queryable, id: string): Promise<boolean> {
  const row = await selectRow(db, IdRow, 'DELETE FROM category_rules WHERE id = $1 RETURNING id', [
    id,
  ]);
  return row !== null;
}
