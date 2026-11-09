import type pg from 'pg';

import type { BatteryStore, BatteryTransaction } from '../use-cases/store.js';
import * as alerts from './alert-state-table.js';
import * as daily from './daily-table.js';
import * as samples from './samples-table.js';
import { inTransaction, type Queryable } from './sql.js';

function bind(db: Queryable): BatteryTransaction {
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

/** The battery store on Postgres. Every query is parameterized (SECURITY A8). */
export function createPgStore(pool: pg.Pool): BatteryStore {
  return {
    transaction: (work) => inTransaction(pool, (client) => work(bind(client))),
  };
}
