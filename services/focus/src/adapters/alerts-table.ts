import { parseRows, pgArray, toPgText, unnest } from '@yoman/service-kit/sql';
import { type Alert, AlertLevel, AlertParams, AlertType, QueuedAlert } from '@yoman/shared/alerts';
import type { AlertPolicyEntry } from '@yoman/shared/focus';
import { type Kysely, sql } from 'kysely';
import { z } from 'zod';

import type { FocusDatabase } from './database.js';

type Db = Kysely<FocusDatabase>;

const PolicyRow = z.object({ type: AlertType, level: AlertLevel });
const AcceptedRow = z.object({ alert_key: z.string(), accepted_at: z.date() });
const QueuedRow = z.object({
  alert_key: z.string(),
  type: AlertType,
  level: AlertLevel,
  ts: z.date(),
  params: AlertParams,
  queued_at: z.date(),
});
type QueuedRow = z.infer<typeof QueuedRow>;

const QUEUED_COLUMNS = ['alert_key', 'type', 'level', 'ts', 'params', 'queued_at'] as const;

function toQueuedAlert(row: QueuedRow): QueuedAlert {
  return QueuedAlert.parse({
    alert: {
      alertKey: row.alert_key,
      type: row.type,
      level: row.level,
      ts: row.ts.toISOString(),
      params: row.params,
    },
    queuedAt: row.queued_at.toISOString(),
  });
}

/** `jsonb` strings cannot hold U+0000 either, so param text goes through the same replacement. */
function storableParams(params: Alert['params']): string {
  const entries = Object.entries(params).map(([key, value]) => [
    key,
    typeof value === 'string' ? toPgText(value) : value,
  ]);
  return JSON.stringify(Object.fromEntries(entries));
}

export async function alertPolicy(db: Db): Promise<Map<AlertType, AlertLevel>> {
  const rows = parseRows(
    PolicyRow,
    await db.selectFrom('alert_policy').select(['type', 'level']).execute(),
  );
  return new Map(rows.map((row) => [row.type, row.level]));
}

export async function replaceAlertPolicy(
  db: Db,
  entries: readonly AlertPolicyEntry[],
): Promise<void> {
  await db.deleteFrom('alert_policy').execute();
  if (entries.length === 0) {
    return;
  }
  await db
    .insertInto('alert_policy')
    .columns(['type', 'level'])
    .expression((eb) =>
      eb
        .selectFrom(
          unnest<{ type: string; level: string }, 't'>('t', {
            type: pgArray(
              'text',
              entries.map((entry) => entry.type),
            ),
            level: pgArray(
              'text',
              entries.map((entry) => entry.level),
            ),
          }),
        )
        .selectAll(),
    )
    .execute();
}

export async function lastAccepted(db: Db, keys: readonly string[]): Promise<Map<string, number>> {
  if (keys.length === 0) {
    return new Map();
  }
  const rows = parseRows(
    AcceptedRow,
    await db
      .selectFrom('alert_rate_limits')
      .select(['alert_key', 'accepted_at'])
      .where('alert_key', '=', (eb) => eb.fn.any(pgArray('text', [...new Set(keys)])))
      .execute(),
  );
  return new Map(rows.map((row) => [row.alert_key, row.accepted_at.getTime()]));
}

export async function recordAccepted(db: Db, keys: readonly string[], atMs: number): Promise<void> {
  if (keys.length === 0) {
    return;
  }
  await db
    .insertInto('alert_rate_limits')
    .columns(['alert_key', 'accepted_at'])
    .expression((eb) =>
      eb
        .selectFrom(unnest<{ key: string }, 't'>('t', { key: pgArray('text', [...new Set(keys)]) }))
        .select(['t.key', sql<Date>`${new Date(atMs)}`.as('accepted_at')]),
    )
    .onConflict((conflict) =>
      conflict
        .column('alert_key')
        .doUpdateSet((eb) => ({ accepted_at: eb.ref('excluded.accepted_at') })),
    )
    .execute();
}

export async function forgetAcceptedBefore(db: Db, beforeMs: number): Promise<void> {
  await db.deleteFrom('alert_rate_limits').where('accepted_at', '<', new Date(beforeMs)).execute();
}

interface AlertBatchRow {
  readonly alert_key: string;
  readonly type: string;
  readonly level: string;
  readonly ts: Date;
  readonly params: string;
}

/** Appends in order, then keeps only the newest `capacity` alerts. */
export async function enqueue(
  db: Db,
  alerts: readonly Alert[],
  atMs: number,
  capacity: number,
): Promise<void> {
  if (alerts.length === 0) {
    return;
  }
  const batch = unnest<AlertBatchRow, 't'>(
    't',
    {
      alert_key: pgArray(
        'text',
        alerts.map((alert) => alert.alertKey),
      ),
      type: pgArray(
        'text',
        alerts.map((alert) => alert.type),
      ),
      level: pgArray(
        'text',
        alerts.map((alert) => alert.level),
      ),
      ts: pgArray(
        'timestamptz',
        alerts.map((alert) => new Date(alert.ts)),
      ),
      params: pgArray(
        'jsonb',
        alerts.map((alert) => storableParams(alert.params)),
      ),
    },
    { ordinality: 'ord' },
  );
  await db
    .insertInto('queued_alerts')
    .columns([...QUEUED_COLUMNS])
    .expression((eb) =>
      eb
        .selectFrom(batch)
        .select([
          't.alert_key',
          't.type',
          't.level',
          't.ts',
          't.params',
          sql<Date>`${new Date(atMs)}`.as('queued_at'),
        ])
        .orderBy(sql.ref('t.ord')),
    )
    .execute();
  await db
    .deleteFrom('queued_alerts')
    .where('id', 'not in', (eb) =>
      eb.selectFrom('queued_alerts').select('id').orderBy('id', 'desc').limit(capacity),
    )
    .execute();
}

export async function listQueue(db: Db, limit: number): Promise<QueuedAlert[]> {
  const rows = parseRows(
    QueuedRow,
    await db
      .selectFrom('queued_alerts')
      .select(QUEUED_COLUMNS)
      .orderBy('id')
      .limit(limit)
      .execute(),
  );
  return rows.map(toQueuedAlert);
}

export async function drainQueue(db: Db): Promise<QueuedAlert[]> {
  const rows = parseRows(
    QueuedRow,
    await db
      .with('drained', (qb) => qb.deleteFrom('queued_alerts').returning(['id', ...QUEUED_COLUMNS]))
      .selectFrom('drained')
      .select(QUEUED_COLUMNS)
      .orderBy('id')
      .execute(),
  );
  return rows.map(toQueuedAlert);
}
