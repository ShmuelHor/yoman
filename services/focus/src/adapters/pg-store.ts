import { createQueryBuilder, inTransaction } from '@yoman/service-kit/sql';
import type { Kysely, PostgresPool } from 'kysely';

import type { FocusStore, FocusTransaction } from '../use-cases/store.js';
import * as alerts from './alerts-table.js';
import type { FocusDatabase } from './database.js';
import * as knownApps from './known-apps-table.js';
import * as profiles from './profiles-table.js';
import * as schedules from './schedules-table.js';
import * as sessions from './sessions-table.js';

function bind(db: Kysely<FocusDatabase>): FocusTransaction {
  return {
    lock: () => sessions.lock(db),
    openSession: () => sessions.openSession(db),
    startSession: (session) => sessions.startSession(db, session),
    endSession: (id, endedAtMs) => sessions.endSession(db, id, endedAtMs),
    listProfiles: (limit) => profiles.listProfiles(db, limit),
    countProfiles: () => profiles.countProfiles(db),
    getProfile: (id) => profiles.getProfile(db, id),
    defaultProfile: () => profiles.defaultProfile(db),
    createProfile: (input) => profiles.createProfile(db, input),
    updateProfile: (id, input) => profiles.updateProfile(db, id, input),
    deleteProfile: (id) => profiles.deleteProfile(db, id),
    listKnownApps: (limit) => knownApps.listKnownApps(db, limit),
    saveKnownApps: (apps) => knownApps.saveKnownApps(db, apps),
    alertPolicy: () => alerts.alertPolicy(db),
    replaceAlertPolicy: (entries) => alerts.replaceAlertPolicy(db, entries),
    lastAccepted: (keys) => alerts.lastAccepted(db, keys),
    recordAccepted: (keys, atMs) => alerts.recordAccepted(db, keys, atMs),
    forgetAcceptedBefore: (beforeMs) => alerts.forgetAcceptedBefore(db, beforeMs),
    enqueue: (items, atMs, capacity) => alerts.enqueue(db, items, atMs, capacity),
    listQueue: (limit) => alerts.listQueue(db, limit),
    drainQueue: () => alerts.drainQueue(db),
    listSchedules: (limit) => schedules.listSchedules(db, limit),
    countSchedules: () => schedules.countSchedules(db),
    createSchedule: (input) => schedules.createSchedule(db, input),
    updateSchedule: (id, input) => schedules.updateSchedule(db, id, input),
    deleteSchedule: (id) => schedules.deleteSchedule(db, id),
  };
}

/** The focus store on Postgres. Kysely sends every value as a bind parameter (SECURITY A8). */
export function createPgStore(pool: PostgresPool): FocusStore {
  const db = createQueryBuilder<FocusDatabase>(pool);
  return {
    transaction: (work) => inTransaction(db, (trx) => work(bind(trx))),
  };
}
