import type { SystemStore, SystemTransaction } from '../use-cases/store.js';
import * as incidents from './incidents-table.js';
import * as samples from './samples-table.js';
import { type ClientPool, inTransaction, type Queryable } from './sql.js';
import * as tracks from './tracks-table.js';

function bind(db: Queryable): SystemTransaction {
  return {
    lockTracks: () => tracks.lockTracks(db),
    saveTracks: (entries) => tracks.saveTracks(db, entries),
    recordedUntil: () => tracks.recordedUntil(db),
    setRecordedUntil: (kind, tsMs) => tracks.setRecordedUntil(db, kind, tsMs),
    insertPressure: (entries) => samples.insertPressure(db, entries),
    insertProcesses: (entries) => samples.insertProcesses(db, entries),
    processPeaks: (startMs, endMs) => samples.processPeaks(db, startMs, endMs),
    rssHistory: (keys, startMs, endMs) => samples.rssHistory(db, keys, startMs, endMs),
    pruneBefore: (cutoffMs) => samples.pruneBefore(db, cutoffMs),
    pressurePoints: (startMs, endMs, limit) => samples.pressurePoints(db, startMs, endMs, limit),
    openIncidents: () => incidents.openIncidents(db),
    saveIncidents: (entries) => incidents.saveIncidents(db, entries),
    listIncidents: (range, limit) => incidents.listIncidents(db, range, limit),
    culpritCounts: (sinceMs, limit) => incidents.culpritCounts(db, sinceMs, limit),
  };
}

/** The system store on Postgres. Every query is parameterized (SECURITY A8). */
export function createPgStore(pool: ClientPool): SystemStore {
  return {
    transaction: (work) => inTransaction(pool, (client) => work(bind(client))),
  };
}
