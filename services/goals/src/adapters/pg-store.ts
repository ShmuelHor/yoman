import { createQueryBuilder, inTransaction } from '@yoman/service-kit/sql';
import type { Kysely, PostgresPool } from 'kysely';

import type { GoalsStore, GoalsTransaction } from '../use-cases/store.js';
import type { GoalsDatabase } from './database.js';
import * as events from './events-table.js';
import * as goals from './goals-table.js';
import * as usage from './usage-table.js';

function bind(db: Kysely<GoalsDatabase>): GoalsTransaction {
  return {
    listGoals: (limit) => goals.listGoals(db, limit),
    countGoals: () => goals.countGoals(db),
    createGoal: (input) => goals.createGoal(db, input),
    updateGoal: (id, input) => goals.updateGoal(db, id, input),
    deleteGoal: (id) => goals.deleteGoal(db, id),
    lockEvaluation: () => usage.lockEvaluation(db),
    latestEvaluatedDate: () => usage.latestEvaluatedDate(db),
    usageOn: (date) => usage.usageOn(db, date),
    saveUsage: (date, day) => usage.saveUsage(db, date, day),
    recordBreaches: (breaches) => events.recordBreaches(db, breaches),
  };
}

/** The goals store on Postgres. Kysely sends every value as a bind parameter (SECURITY A8). */
export function createPgStore(pool: PostgresPool): GoalsStore {
  const db = createQueryBuilder<GoalsDatabase>(pool);
  return {
    transaction: (work) => inTransaction(db, (trx) => work(bind(trx))),
  };
}
