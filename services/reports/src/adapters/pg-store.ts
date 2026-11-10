import { createQueryBuilder, inTransaction } from '@yoman/service-kit/sql';
import type { Kysely, PostgresPool } from 'kysely';

import type { ReportsStore, ReportsTransaction } from '../use-cases/store.js';
import * as counted from './counted-sessions-table.js';
import type { ReportsDatabase } from './database.js';
import * as rollups from './rollups-table.js';
import * as streaks from './streaks-table.js';

function bind(db: Kysely<ReportsDatabase>): ReportsTransaction {
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

/** The reports store on Postgres. Kysely sends every value as a bind parameter (SECURITY A8). */
export function createPgStore(pool: PostgresPool): ReportsStore {
  const db = createQueryBuilder<ReportsDatabase>(pool);
  return {
    transaction: (work) => inTransaction(db, (trx) => work(bind(trx))),
  };
}
