import type { Alert } from '@yoman/shared/alerts';
import type { ProcessSample } from '@yoman/shared/ingest';
import type { Culprit } from '@yoman/shared/system';

import type { SampleBatch, SampleResult } from '../contracts.js';
import { incidentAlert, uniqueAlerts } from '../domain/alerts.js';
import { type ConditionTrack, IDLE_TRACK, trackCondition } from '../domain/condition-tracker.js';
import {
  CONDITION_RULES,
  CONDITION_TYPES,
  type ConditionType,
  conditionPoints,
} from '../domain/conditions.js';
import { rankCulprits } from '../domain/culprits.js';
import { type FreshSamples, freshSamples } from '../domain/fresh-samples.js';
import type { IncidentChange } from '../domain/incident.js';
import { LEAK_WINDOW_MS, type LeakCandidate, trackLeaks } from '../domain/memory-leak.js';
import { processKey, type SystemStore, type SystemTransaction } from './store.js';

const MS_PER_DAY = 86_400_000;
const RETENTION_DAYS = 7;

/** Pressure samples and process snapshots are kept for 7 days (SPEC §5 system). */
export const RETENTION_MS = RETENTION_DAYS * MS_PER_DAY;

/** Applies the pressure and thermal samples to every condition track. */
async function trackConditions(
  tx: SystemTransaction,
  tracks: Map<ConditionType, ConditionTrack>,
  fresh: FreshSamples,
  thresholds: SampleBatch['thresholds'],
): Promise<IncidentChange[]> {
  const open = await tx.openIncidents();
  const points = conditionPoints(fresh.pressure, fresh.thermal, thresholds);
  const changes: IncidentChange[] = [];
  for (const type of CONDITION_TYPES) {
    const result = trackCondition(
      CONDITION_RULES[type],
      tracks.get(type) ?? IDLE_TRACK,
      open.find((incident) => incident.type === type) ?? null,
      points[type],
    );
    tracks.set(type, result.track);
    changes.push(...result.changes);
  }
  await tx.saveTracks(tracks);
  return changes;
}

/** The incident's culprits: the worst processes while it lasted, up to now if it is open. */
async function withCulprits(
  tx: SystemTransaction,
  change: IncidentChange,
  untilMs: number,
): Promise<IncidentChange> {
  const { incident } = change;
  const peaks = await tx.processPeaks(incident.startMs, incident.endMs ?? untilMs);
  return { ...change, incident: { ...incident, culprits: rankCulprits(incident.type, peaks) } };
}

function toCulprit(process: ProcessSample['processes'][number]): Culprit {
  return {
    pid: process.pid,
    comm: process.comm,
    container: process.container ?? null,
    cpuPct: process.cpuPct,
    rssBytes: process.rssBytes,
  };
}

/** Checks every process of the newest process sample for a leak over the last hour. */
async function trackMemoryLeaks(
  tx: SystemTransaction,
  latest: ProcessSample | undefined,
): Promise<IncidentChange[]> {
  if (latest === undefined) {
    return [];
  }
  const atMs = Date.parse(latest.ts);
  const history = await tx.rssHistory(latest.processes, atMs - LEAK_WINDOW_MS, atMs);
  const candidates = latest.processes.map(
    (process): LeakCandidate => ({
      culprit: toCulprit(process),
      history: history.get(processKey(process)) ?? [],
    }),
  );
  const open = (await tx.openIncidents()).filter((incident) => incident.type === 'memory-leak');
  return trackLeaks(open, candidates, atMs);
}

/**
 * Records one batch in one transaction: stores the samples, opens, extends
 * and closes incidents with their culprits, and returns an alert for each
 * incident it opened. `nowMs` only decides what is old enough to prune.
 */
export function recordSamples(
  store: SystemStore,
  batch: SampleBatch,
  nowMs: number,
): Promise<SampleResult> {
  return store.transaction(async (tx) => {
    const tracks = await tx.lockTracks();
    const fresh = freshSamples(batch.samples, await tx.recordedUntil());
    await tx.insertPressure(fresh.pressure);
    await tx.insertProcesses(fresh.processes);

    const changes: IncidentChange[] = [];
    const lastPointMs = Math.max(
      fresh.recordedUntil.pressure ?? 0,
      fresh.recordedUntil.thermal ?? 0,
    );
    for (const change of await trackConditions(tx, tracks, fresh, batch.thresholds)) {
      changes.push(await withCulprits(tx, change, lastPointMs));
    }
    changes.push(...(await trackMemoryLeaks(tx, fresh.processes.at(-1))));
    const saved = await tx.saveIncidents(changes.map((change) => change.incident));

    for (const kind of ['pressure', 'processes', 'thermal'] as const) {
      const mark = fresh.recordedUntil[kind];
      if (mark !== null) {
        await tx.setRecordedUntil(kind, mark);
      }
    }
    await tx.pruneBefore(nowMs - RETENTION_MS);

    const alerts = changes.flatMap((change, index): Alert[] => {
      const incident = saved[index];
      return change.openedAtMs === null || incident === undefined
        ? []
        : [incidentAlert(incident, change.openedAtMs)];
    });
    return { accepted: fresh.accepted, late: fresh.late, alerts: uniqueAlerts(alerts) };
  });
}
