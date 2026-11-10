import type { TimeRangeQuery } from '@yoman/shared/common';
import { LIMITS } from '@yoman/shared/limits';
import { Culprit, type CulpritSummary, type Incident, IncidentType } from '@yoman/shared/system';
import { z } from 'zod';

import type { IncidentState } from '../domain/incident.js';
import type { StoredIncident } from '../use-cases/store.js';
import { type Queryable, selectRow, selectRows } from './sql.js';

const IncidentRow = z.object({
  id: z.string(),
  type: IncidentType,
  start_at: z.date(),
  end_at: z.date().nullable(),
  peak: z.number(),
  culprits: z.array(Culprit).max(LIMITS.topProcesses),
  pid: z.number().int().nullable(),
});
type IncidentRow = z.infer<typeof IncidentRow>;

const CountRow = z.object({
  comm: z.string(),
  container: z.string().nullable(),
  incidents: z.number().int(),
});

const IdRow = z.object({ id: z.string() });

const COLUMNS = 'id, type, start_at, end_at, peak, culprits, pid';

function toState(row: IncidentRow): StoredIncident {
  return {
    id: row.id,
    type: row.type,
    startMs: row.start_at.getTime(),
    endMs: row.end_at?.getTime() ?? null,
    peak: row.peak,
    culprits: row.culprits,
    pid: row.pid,
  };
}

function toIncident(row: IncidentRow): Incident {
  return {
    id: row.id,
    type: row.type,
    start: row.start_at.toISOString(),
    end: row.end_at?.toISOString() ?? null,
    peak: row.peak,
    culprits: row.culprits,
  };
}

function toDate(ms: number | null): Date | null {
  return ms === null ? null : new Date(ms);
}

export async function openIncidents(db: Queryable): Promise<StoredIncident[]> {
  const rows = await selectRows(
    db,
    IncidentRow,
    `SELECT ${COLUMNS} FROM incidents WHERE end_at IS NULL ORDER BY start_at, id`,
  );
  return rows.map(toState);
}

async function insertIncident(db: Queryable, incident: IncidentState): Promise<string> {
  const row = await selectRow(
    db,
    IdRow,
    `INSERT INTO incidents (type, start_at, end_at, peak, culprits, pid)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      incident.type,
      new Date(incident.startMs),
      toDate(incident.endMs),
      incident.peak,
      JSON.stringify(incident.culprits),
      incident.pid,
    ],
  );
  if (row === null) {
    throw new Error('INSERT returned no row');
  }
  return row.id;
}

async function updateIncident(db: Queryable, id: string, incident: IncidentState): Promise<void> {
  await db.query('UPDATE incidents SET end_at = $2, peak = $3, culprits = $4 WHERE id = $1', [
    id,
    toDate(incident.endMs),
    incident.peak,
    JSON.stringify(incident.culprits),
  ]);
}

/** In order: an incident must close before the next one of its kind opens (one open at most). */
export async function saveIncidents(
  db: Queryable,
  incidents: readonly IncidentState[],
): Promise<StoredIncident[]> {
  const saved: StoredIncident[] = [];
  for (const incident of incidents) {
    if (incident.id === null) {
      saved.push({ ...incident, id: await insertIncident(db, incident) });
    } else {
      await updateIncident(db, incident.id, incident);
      saved.push({ ...incident, id: incident.id });
    }
  }
  return saved;
}

/** Incidents overlapping `[from, to)`. An open incident lasts until now. */
export async function listIncidents(
  db: Queryable,
  range: TimeRangeQuery,
  limit: number,
): Promise<Incident[]> {
  const rows = await selectRows(
    db,
    IncidentRow,
    `SELECT ${COLUMNS} FROM incidents
     WHERE start_at < $2 AND (end_at IS NULL OR end_at >= $1) ORDER BY start_at, id LIMIT $3`,
    [range.from, range.to, limit],
  );
  return rows.map(toIncident);
}

export async function culpritCounts(
  db: Queryable,
  sinceMs: number,
  limit: number,
): Promise<CulpritSummary[]> {
  return selectRows(
    db,
    CountRow,
    `SELECT c.comm, c.container, count(DISTINCT i.id)::int AS incidents
     FROM incidents i CROSS JOIN LATERAL jsonb_to_recordset(i.culprits) AS c(comm text, container text)
     WHERE i.start_at >= $1
     GROUP BY c.comm, c.container
     ORDER BY incidents DESC, c.comm, c.container NULLS FIRST LIMIT $2`,
    [new Date(sinceMs), limit],
  );
}
