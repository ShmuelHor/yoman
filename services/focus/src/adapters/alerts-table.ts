import { type Alert, AlertLevel, AlertParams, AlertType, QueuedAlert } from '@yoman/shared/alerts';
import type { AlertPolicyEntry } from '@yoman/shared/focus';
import { z } from 'zod';

import { type Queryable, selectRows, toPgText } from './sql.js';

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

const QUEUED_COLUMNS = 'alert_key, type, level, ts, params, queued_at';

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

export async function alertPolicy(db: Queryable): Promise<Map<AlertType, AlertLevel>> {
  const rows = await selectRows(db, PolicyRow, 'SELECT type, level FROM alert_policy');
  return new Map(rows.map((row) => [row.type, row.level]));
}

export async function replaceAlertPolicy(
  db: Queryable,
  entries: readonly AlertPolicyEntry[],
): Promise<void> {
  await db.query('DELETE FROM alert_policy');
  if (entries.length === 0) {
    return;
  }
  await db.query(
    'INSERT INTO alert_policy (type, level) SELECT * FROM unnest($1::text[], $2::text[])',
    [entries.map((entry) => entry.type), entries.map((entry) => entry.level)],
  );
}

export async function lastAccepted(
  db: Queryable,
  keys: readonly string[],
): Promise<Map<string, number>> {
  if (keys.length === 0) {
    return new Map();
  }
  const rows = await selectRows(
    db,
    AcceptedRow,
    'SELECT alert_key, accepted_at FROM alert_rate_limits WHERE alert_key = ANY($1::text[])',
    [[...new Set(keys)]],
  );
  return new Map(rows.map((row) => [row.alert_key, row.accepted_at.getTime()]));
}

export async function recordAccepted(
  db: Queryable,
  keys: readonly string[],
  atMs: number,
): Promise<void> {
  if (keys.length === 0) {
    return;
  }
  await db.query(
    `INSERT INTO alert_rate_limits (alert_key, accepted_at)
     SELECT key, $2 FROM unnest($1::text[]) AS t(key)
     ON CONFLICT (alert_key) DO UPDATE SET accepted_at = EXCLUDED.accepted_at`,
    [[...new Set(keys)], new Date(atMs)],
  );
}

export async function forgetAcceptedBefore(db: Queryable, beforeMs: number): Promise<void> {
  await db.query('DELETE FROM alert_rate_limits WHERE accepted_at < $1', [new Date(beforeMs)]);
}

/** Appends in order, then keeps only the newest `capacity` alerts. */
export async function enqueue(
  db: Queryable,
  alerts: readonly Alert[],
  atMs: number,
  capacity: number,
): Promise<void> {
  if (alerts.length === 0) {
    return;
  }
  await db.query(
    `INSERT INTO queued_alerts (alert_key, type, level, ts, params, queued_at)
     SELECT t.alert_key, t.type, t.level, t.ts, t.params, $6
     FROM unnest($1::text[], $2::text[], $3::text[], $4::timestamptz[], $5::jsonb[])
       WITH ORDINALITY AS t(alert_key, type, level, ts, params, ord)
     ORDER BY t.ord`,
    [
      alerts.map((alert) => alert.alertKey),
      alerts.map((alert) => alert.type),
      alerts.map((alert) => alert.level),
      alerts.map((alert) => new Date(alert.ts)),
      alerts.map((alert) => storableParams(alert.params)),
      new Date(atMs),
    ],
  );
  await db.query(
    `DELETE FROM queued_alerts
     WHERE id NOT IN (SELECT id FROM queued_alerts ORDER BY id DESC LIMIT $1)`,
    [capacity],
  );
}

export async function listQueue(db: Queryable, limit: number): Promise<QueuedAlert[]> {
  const rows = await selectRows(
    db,
    QueuedRow,
    `SELECT ${QUEUED_COLUMNS} FROM queued_alerts ORDER BY id LIMIT $1`,
    [limit],
  );
  return rows.map(toQueuedAlert);
}

export async function drainQueue(db: Queryable): Promise<QueuedAlert[]> {
  const rows = await selectRows(
    db,
    QueuedRow,
    `WITH drained AS (DELETE FROM queued_alerts RETURNING id, ${QUEUED_COLUMNS})
     SELECT ${QUEUED_COLUMNS} FROM drained ORDER BY id`,
  );
  return rows.map(toQueuedAlert);
}
