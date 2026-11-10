import { parseRow, parseRows, toPgText } from '@yoman/service-kit/sql';
import { Rule, type RuleInput } from '@yoman/shared/sessions';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import type { SessionsDatabase } from './database.js';

type Db = Kysely<SessionsDatabase>;

/** `count(*)` is a bigint, which pg returns as a string. */
const CountRow = z.object({ count: z.coerce.number().int().min(0) });
const IdRow = z.object({ id: z.string() });

const RULE_COLUMNS = [
  'id',
  'field',
  'match_type as match',
  'pattern',
  'category',
  'priority',
] as const;

function ruleValues(input: RuleInput): {
  field: string;
  match_type: string;
  pattern: string;
  category: string;
  priority: number;
} {
  return {
    field: input.field,
    match_type: input.match,
    pattern: toPgText(input.pattern),
    category: input.category,
    priority: input.priority,
  };
}

export async function listRules(db: Db, limit: number): Promise<Rule[]> {
  return parseRows(
    Rule,
    await db
      .selectFrom('category_rules')
      .select(RULE_COLUMNS)
      .orderBy('priority', 'desc')
      .orderBy('id')
      .limit(limit)
      .execute(),
  );
}

export async function countRules(db: Db): Promise<number> {
  const row = parseRow(
    CountRow,
    await db
      .selectFrom('category_rules')
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirst(),
  );
  return row?.count ?? 0;
}

export async function createRule(db: Db, input: RuleInput): Promise<Rule> {
  const rule = parseRow(
    Rule,
    await db
      .insertInto('category_rules')
      .values(ruleValues(input))
      .returning(RULE_COLUMNS)
      .executeTakeFirst(),
  );
  if (rule === null) {
    throw new Error('INSERT returned no row');
  }
  return rule;
}

export async function updateRule(db: Db, id: string, input: RuleInput): Promise<Rule | null> {
  return parseRow(
    Rule,
    await db
      .updateTable('category_rules')
      .set(ruleValues(input))
      .where('id', '=', id)
      .returning(RULE_COLUMNS)
      .executeTakeFirst(),
  );
}

export async function deleteRule(db: Db, id: string): Promise<boolean> {
  const row = parseRow(
    IdRow,
    await db.deleteFrom('category_rules').where('id', '=', id).returning('id').executeTakeFirst(),
  );
  return row !== null;
}
