import { z } from 'zod';

import { type AlertState, DRAIN_LEVELS, INITIAL_ALERT_STATE } from '../domain/battery-alerts.js';
import { type Queryable, selectRow } from './sql.js';

/** Any batch transaction takes it first, so two never fold samples into the state at once. */
const SAMPLES_LOCK_KEY = 16;

const StateRow = z.object({
  last_ts: z.date(),
  drain: z.enum(DRAIN_LEVELS),
  full_since: z.date().nullable(),
  full_alerted: z.boolean(),
});

export async function lockSamples(db: Queryable): Promise<void> {
  await db.query('SELECT pg_advisory_xact_lock($1)', [SAMPLES_LOCK_KEY]);
}

export async function alertState(db: Queryable): Promise<AlertState> {
  const row = await selectRow(
    db,
    StateRow,
    'SELECT last_ts, drain, full_since, full_alerted FROM alert_state',
  );
  if (row === null) {
    return INITIAL_ALERT_STATE;
  }
  return {
    lastTsMs: row.last_ts.getTime(),
    drain: row.drain,
    fullSinceMs: row.full_since === null ? null : row.full_since.getTime(),
    fullAlerted: row.full_alerted,
  };
}

/** A state without `lastTsMs` has applied nothing, so there is nothing to keep. */
export async function saveAlertState(db: Queryable, state: AlertState): Promise<void> {
  if (state.lastTsMs === null) {
    return;
  }
  await db.query(
    `INSERT INTO alert_state (last_ts, drain, full_since, full_alerted) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET last_ts = EXCLUDED.last_ts, drain = EXCLUDED.drain,
       full_since = EXCLUDED.full_since, full_alerted = EXCLUDED.full_alerted`,
    [
      new Date(state.lastTsMs),
      state.drain,
      state.fullSinceMs === null ? null : new Date(state.fullSinceMs),
      state.fullAlerted,
    ],
  );
}
