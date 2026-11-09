import type pg from 'pg';

import type { GoalsStore, GoalsTransaction } from '../use-cases/store.js';
import * as events from './events-table.js';
import * as goals from './goals-table.js';
import { inTransaction, type Queryable } from './sql.js';
import * as usage from './usage-table.js';

function bind(db: Queryable): GoalsTransaction {
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

/** The goals store on Postgres. Every query is parameterized (SECURITY A8). */
export function createPgStore(pool: pg.Pool): GoalsStore {
  return {
    transaction: (work) => inTransaction(pool, (client) => work(bind(client))),
  };
}
