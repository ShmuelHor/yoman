import type pg from 'pg';

import type { ReportsStore, ReportsTransaction } from '../use-cases/store.js';
import * as counted from './counted-sessions-table.js';
import * as rollups from './rollups-table.js';
import { inTransaction, type Queryable } from './sql.js';
import * as streaks from './streaks-table.js';

function bind(db: Queryable): ReportsTransaction {
  return {
    lockWrites: () => streaks.lockStreaks(db),
    markCounted: (sessions) => counted.markCounted(db, sessions),
    addToRollups: (entries) => rollups.addToRollups(db, entries),
    rollups: (from, to) => rollups.rollups(db, from, to),
    streaksNear: (categories, fromMs, toMs) => streaks.streaksNear(db, categories, fromMs, toMs),
    streaksStarting: (fromMs, toMs) => streaks.streaksStarting(db, fromMs, toMs),
    replaceStreaks: (removed, added) => streaks.replaceStreaks(db, removed, added),
  };
}

/** The reports store on Postgres. Every query is parameterized (SECURITY A8). */
export function createPgStore(pool: pg.Pool): ReportsStore {
  return {
    transaction: (work) => inTransaction(pool, (client) => work(bind(client))),
  };
}
