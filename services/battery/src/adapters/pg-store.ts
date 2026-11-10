import { createQueryBuilder, inTransaction } from '@yoman/service-kit/sql';
import type { Kysely, PostgresPool } from 'kysely';

import type { BatteryStore, BatteryTransaction } from '../use-cases/store.js';
import * as alerts from './alert-state-table.js';
import * as daily from './daily-table.js';
import type { BatteryDatabase } from './database.js';
import * as samples from './samples-table.js';

function bind(db: Kysely<BatteryDatabase>): BatteryTransaction {
  return {
    lockSamples: () => alerts.lockSamples(db),
    insertSamples: (rows) => samples.insertSamples(db, rows),
    samplesOn: (dates) => samples.samplesOn(db, dates),
    latestSample: () => samples.latestSample(db),
    readingsBetween: (fromMs, toMs, limit) => samples.readingsBetween(db, fromMs, toMs, limit),
    saveDays: (days) => daily.saveDays(db, days),
    daysSince: (date, limit) => daily.daysSince(db, date, limit),
    alertState: () => alerts.alertState(db),
    saveAlertState: (state) => alerts.saveAlertState(db, state),
  };
}

/** The battery store on Postgres. Kysely sends every value as a bind parameter (SECURITY A8). */
export function createPgStore(pool: PostgresPool): BatteryStore {
  const db = createQueryBuilder<BatteryDatabase>(pool);
  return {
    transaction: (work) => inTransaction(db, (trx) => work(bind(trx))),
  };
}
