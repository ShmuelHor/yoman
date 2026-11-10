import { parseRow, parseRows } from '@yoman/service-kit/sql';
import type { TimeRangeQuery } from '@yoman/shared/common';
import { LIMITS } from '@yoman/shared/limits';
import { Culprit, type CulpritSummary, type Incident, IncidentType } from '@yoman/shared/system';
import { type Kysely, sql } from 'kysely';
import { z } from 'zod';

import type { IncidentState } from '../domain/incident.js';
import type { StoredIncident } from '../use-cases/store.js';
import type { SystemDatabase } from './database.js';

type Db = Kysely<SystemDatabase>;

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

const COLUMNS = ['id', 'type', 'start_at', 'end_at', 'peak', 'culprits', 'pid'] as const;

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

export async function openIncidents(db: Db): Promise<StoredIncident[]> {
  const rows = parseRows(
    IncidentRow,
    await db
      .selectFrom('incidents')
      .select(COLUMNS)
      .where('end_at', 'is', null)
      .orderBy('start_at')
      .orderBy('id')
      .execute(),
  );
  return rows.map(toState);
}

async function insertIncident(db: Db, incident: IncidentState): Promise<string> {
  const row = parseRow(
    IdRow,
    await db
      .insertInto('incidents')
      .values({
        type: incident.type,
        start_at: new Date(incident.startMs),
        end_at: toDate(incident.endMs),
        peak: incident.peak,
        culprits: JSON.stringify(incident.culprits),
        pid: incident.pid,
      })
      .returning('id')
      .executeTakeFirst(),
  );
  if (row === null) {
    throw new Error('INSERT returned no row');
  }
  return row.id;
}

async function updateIncident(db: Db, id: string, incident: IncidentState): Promise<void> {
  await db
    .updateTable('incidents')
    .set({
      end_at: toDate(incident.endMs),
      peak: incident.peak,
      culprits: JSON.stringify(incident.culprits),
    })
    .where('id', '=', id)
    .execute();
}

/** In order: an incident must close before the next one of its kind opens (one open at most). */
export async function saveIncidents(
  db: Db,
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
  db: Db,
  range: TimeRangeQuery,
  limit: number,
): Promise<Incident[]> {
  const rows = parseRows(
    IncidentRow,
    await db
      .selectFrom('incidents')
      .select(COLUMNS)
      .where('start_at', '<', new Date(range.to))
      .where((eb) => eb.or([eb('end_at', 'is', null), eb('end_at', '>=', new Date(range.from))]))
      .orderBy('start_at')
      .orderBy('id')
      .limit(limit)
      .execute(),
  );
  return rows.map(toIncident);
}

export async function culpritCounts(
  db: Db,
  sinceMs: number,
  limit: number,
): Promise<CulpritSummary[]> {
  return parseRows(
    CountRow,
    await db
      .selectFrom('incidents as i')
      .crossJoinLateral(
        sql<{ comm: string; container: string | null }>`jsonb_to_recordset(i.culprits)`.as<'c'>(
          sql`c(comm text, container text)`,
        ),
      )
      .select(['c.comm', 'c.container', sql<number>`count(DISTINCT i.id)::int`.as('incidents')])
      .where('i.start_at', '>=', new Date(sinceMs))
      .groupBy(['c.comm', 'c.container'])
      .orderBy('incidents', 'desc')
      .orderBy('c.comm')
      .orderBy('c.container', (order) => order.nullsFirst())
      .limit(limit)
      .execute(),
  );
}
