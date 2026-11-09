import type { TimeRangeQuery } from '@yoman/shared/common';
import type { PressureSample, ProcessSample } from '@yoman/shared/ingest';
import type { CulpritSummary, Incident, PressurePoint } from '@yoman/shared/system';

import type { ConditionTrack } from '../domain/condition-tracker.js';
import type { ConditionType } from '../domain/conditions.js';
import type { ProcessPeak } from '../domain/culprits.js';
import type { SystemSampleKind, Watermarks } from '../domain/fresh-samples.js';
import type { IncidentState } from '../domain/incident.js';
import type { RssPoint } from '../domain/memory-leak.js';

/** An incident after it was written, so it has an id. */
export interface StoredIncident extends IncidentState {
  readonly id: string;
}

/** A process, identified the way a pid reused by another program is told apart. */
export interface ProcessKey {
  readonly pid: number;
  readonly comm: string;
}

/**
 * Everything the use cases need from storage, inside one transaction. The
 * Postgres adapter implements it; tests use an in-memory one.
 */
export interface SystemTransaction {
  /**
   * The condition tracks, a missing one as idle. Also blocks other writers
   * until the transaction ends, so two batches never advance the same track.
   */
  readonly lockTracks: () => Promise<Map<ConditionType, ConditionTrack>>;
  readonly saveTracks: (tracks: ReadonlyMap<ConditionType, ConditionTrack>) => Promise<void>;
  readonly recordedUntil: () => Promise<Watermarks>;
  readonly setRecordedUntil: (kind: SystemSampleKind, tsMs: number) => Promise<void>;

  readonly insertPressure: (samples: readonly PressureSample[]) => Promise<void>;
  readonly insertProcesses: (samples: readonly ProcessSample[]) => Promise<void>;
  /** Each process at its worst over `[startMs, endMs]`. */
  readonly processPeaks: (startMs: number, endMs: number) => Promise<ProcessPeak[]>;
  /** The RSS history of each process over `[startMs, endMs]`, keyed by `pid:comm`. */
  readonly rssHistory: (
    keys: readonly ProcessKey[],
    startMs: number,
    endMs: number,
  ) => Promise<Map<string, RssPoint[]>>;
  /** Drops pressure samples and process snapshots older than `cutoffMs`. */
  readonly pruneBefore: (cutoffMs: number) => Promise<void>;

  readonly openIncidents: () => Promise<StoredIncident[]>;
  /** Inserts incidents without an id and updates the others, in order. */
  readonly saveIncidents: (incidents: readonly IncidentState[]) => Promise<StoredIncident[]>;
  /** Incidents overlapping `[from, to)`, oldest first, open ones included. */
  readonly listIncidents: (range: TimeRangeQuery, limit: number) => Promise<Incident[]>;
  /** How many incidents since `sinceMs` each process was a culprit in, most first. */
  readonly culpritCounts: (sinceMs: number, limit: number) => Promise<CulpritSummary[]>;
  /** The `some avg10` values of every pressure sample in `[startMs, endMs)`, oldest first. */
  readonly pressurePoints: (
    startMs: number,
    endMs: number,
    limit: number,
  ) => Promise<PressurePoint[]>;
}

export interface SystemStore {
  /** Runs `work` in one transaction: committed when it resolves, rolled back when it throws. */
  readonly transaction: <T>(work: (tx: SystemTransaction) => Promise<T>) => Promise<T>;
}

export function processKey(key: ProcessKey): string {
  return `${key.pid}:${key.comm}`;
}
