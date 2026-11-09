import { randomUUID } from 'node:crypto';
import type { PressureSample } from '@yoman/shared/ingest';
import type { CulpritSummary, Incident } from '@yoman/shared/system';

import type { ConditionTrack } from '../src/domain/condition-tracker.js';
import type { ConditionType } from '../src/domain/conditions.js';
import type { ProcessPeak } from '../src/domain/culprits.js';
import type { SystemSampleKind } from '../src/domain/fresh-samples.js';
import type { RssPoint } from '../src/domain/memory-leak.js';
import {
  processKey,
  type StoredIncident,
  type SystemStore,
  type SystemTransaction,
} from '../src/use-cases/store.js';

export interface Snapshot extends ProcessPeak {
  readonly tsMs: number;
}

export interface State {
  tracks: Map<ConditionType, ConditionTrack>;
  marks: Record<SystemSampleKind, number | null>;
  pressure: PressureSample[];
  snapshots: Snapshot[];
  incidents: StoredIncident[];
}

export interface MemoryStore extends SystemStore {
  /** The committed state, for assertions. */
  readonly state: () => State;
}

function emptyState(): State {
  return {
    tracks: new Map(),
    marks: { pressure: null, processes: null, thermal: null },
    pressure: [],
    snapshots: [],
    incidents: [],
  };
}

function toIncident(incident: StoredIncident): Incident {
  return {
    id: incident.id,
    type: incident.type,
    start: new Date(incident.startMs).toISOString(),
    end: incident.endMs === null ? null : new Date(incident.endMs).toISOString(),
    peak: incident.peak,
    culprits: [...incident.culprits],
  };
}

function peaks(snapshots: readonly Snapshot[]): ProcessPeak[] {
  const byProcess = new Map<string, ProcessPeak>();
  for (const snapshot of [...snapshots].sort((a, b) => a.tsMs - b.tsMs)) {
    const key = processKey(snapshot);
    const seen = byProcess.get(key);
    byProcess.set(key, {
      pid: snapshot.pid,
      comm: snapshot.comm,
      container: snapshot.container,
      cpuPct: Math.max(seen?.cpuPct ?? 0, snapshot.cpuPct),
      rssBytes: Math.max(seen?.rssBytes ?? 0, snapshot.rssBytes),
      ioBytesPerSec: Math.max(seen?.ioBytesPerSec ?? 0, snapshot.ioBytesPerSec),
    });
  }
  return [...byProcess.values()];
}

function bind(state: State): SystemTransaction {
  const inRange = (tsMs: number, startMs: number, endMs: number): boolean =>
    tsMs >= startMs && tsMs <= endMs;
  return {
    lockTracks: async () => new Map(state.tracks),
    saveTracks: async (tracks): Promise<void> => {
      state.tracks = new Map(tracks);
    },
    recordedUntil: async () => ({ ...state.marks }),
    setRecordedUntil: async (kind, tsMs): Promise<void> => {
      state.marks[kind] = tsMs;
    },
    insertPressure: async (samples): Promise<void> => {
      state.pressure.push(...samples);
    },
    insertProcesses: async (samples): Promise<void> => {
      for (const sample of samples) {
        for (const process of sample.processes) {
          state.snapshots.push({
            tsMs: Date.parse(sample.ts),
            pid: process.pid,
            comm: process.comm,
            container: process.container ?? null,
            cpuPct: process.cpuPct,
            rssBytes: process.rssBytes,
            ioBytesPerSec: process.ioBytesPerSec,
          });
        }
      }
    },
    processPeaks: async (startMs, endMs) =>
      peaks(state.snapshots.filter((snapshot) => inRange(snapshot.tsMs, startMs, endMs))),
    rssHistory: async (keys, startMs, endMs): Promise<Map<string, RssPoint[]>> => {
      const wanted = new Set(keys.map(processKey));
      const history = new Map<string, RssPoint[]>();
      for (const snapshot of state.snapshots) {
        const key = processKey(snapshot);
        if (wanted.has(key) && inRange(snapshot.tsMs, startMs, endMs)) {
          history.set(key, [...(history.get(key) ?? []), snapshot]);
        }
      }
      return history;
    },
    pruneBefore: async (cutoffMs): Promise<void> => {
      state.pressure = state.pressure.filter((sample) => Date.parse(sample.ts) >= cutoffMs);
      state.snapshots = state.snapshots.filter((snapshot) => snapshot.tsMs >= cutoffMs);
    },
    openIncidents: async () => state.incidents.filter((incident) => incident.endMs === null),
    saveIncidents: async (incidents) =>
      incidents.map((incident) => {
        const stored = { ...incident, id: incident.id ?? randomUUID() };
        state.incidents = [...state.incidents.filter((i) => i.id !== stored.id), stored];
        return stored;
      }),
    listIncidents: async (range, limit) =>
      state.incidents
        .filter(
          (incident) =>
            incident.startMs < Date.parse(range.to) &&
            (incident.endMs === null || incident.endMs >= Date.parse(range.from)),
        )
        .sort((a, b) => a.startMs - b.startMs)
        .slice(0, limit)
        .map(toIncident),
    culpritCounts: async (sinceMs, limit): Promise<CulpritSummary[]> => {
      const counts = new Map<string, CulpritSummary>();
      for (const incident of state.incidents.filter((i) => i.startMs >= sinceMs)) {
        for (const { comm, container } of incident.culprits) {
          const key = `${comm}\u0000${container}`;
          const seen = counts.get(key);
          counts.set(key, { comm, container, incidents: (seen?.incidents ?? 0) + 1 });
        }
      }
      return [...counts.values()].sort((a, b) => b.incidents - a.incidents).slice(0, limit);
    },
    pressurePoints: async (startMs, endMs, limit) =>
      state.pressure
        .filter((sample) => Date.parse(sample.ts) >= startMs && Date.parse(sample.ts) < endMs)
        .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
        .slice(0, limit)
        .map((sample) => ({
          ts: sample.ts,
          cpu: sample.cpu.some,
          memory: sample.memory.some,
          io: sample.io.some,
        })),
  };
}

/**
 * An in-memory store with the same contract as the Postgres one. A
 * transaction works on a copy that replaces the state only on success.
 */
export function createMemoryStore(seed: Partial<State> = {}): MemoryStore {
  let committed: State = { ...emptyState(), ...seed };
  const copy = (state: State): State => ({
    tracks: new Map(state.tracks),
    marks: { ...state.marks },
    pressure: [...state.pressure],
    snapshots: [...state.snapshots],
    incidents: [...state.incidents],
  });
  return {
    state: () => copy(committed),
    transaction: async <T>(work: (tx: SystemTransaction) => Promise<T>): Promise<T> => {
      const draft = copy(committed);
      const result = await work(bind(draft));
      committed = draft;
      return result;
    },
  };
}
