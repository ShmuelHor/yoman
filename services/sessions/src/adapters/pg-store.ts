import { createQueryBuilder, inTransaction } from '@yoman/service-kit/sql';
import type { Kysely, PostgresPool } from 'kysely';

import type { SessionsStore, SessionsTransaction } from '../use-cases/store.js';
import * as apps from './apps-table.js';
import type { SessionsDatabase } from './database.js';
import * as rules from './rules-table.js';
import * as sessions from './sessions-table.js';

function bind(db: Kysely<SessionsDatabase>): SessionsTransaction {
  return {
    lockOpenSession: () => sessions.lockOpenSession(db),
    recordedUntil: () => sessions.recordedUntil(db),
    setRecordedUntil: (tsMs) => sessions.setRecordedUntil(db, tsMs),
    saveSpans: (spans) => sessions.saveSpans(db, spans),
    listSessions: (range, limit) => sessions.listSessions(db, range, limit),
    sessionsEndingSince: (cutoff) => sessions.sessionsEndingSince(db, cutoff),
    setCategories: (changes) => sessions.setCategories(db, changes),
    ensureApps: (ids) => apps.ensureApps(db, ids),
    appCategories: () => apps.appCategories(db),
    listApps: (limit) => apps.listApps(db, limit),
    updateApp: (id, update) => apps.updateApp(db, id, update),
    listRules: (limit) => rules.listRules(db, limit),
    countRules: () => rules.countRules(db),
    createRule: (input) => rules.createRule(db, input),
    updateRule: (id, input) => rules.updateRule(db, id, input),
    deleteRule: (id) => rules.deleteRule(db, id),
  };
}

/** The sessions store on Postgres. Kysely sends every value as a bind parameter (SECURITY A8). */
export function createPgStore(pool: PostgresPool): SessionsStore {
  const db = createQueryBuilder<SessionsDatabase>(pool);
  return {
    transaction: (work) => inTransaction(db, (trx) => work(bind(trx))),
  };
}
