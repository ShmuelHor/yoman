import { parseRow } from '@yoman/service-kit/sql';
import { type Kysely, sql } from 'kysely';
import { z } from 'zod';

import { type AlertState, DRAIN_LEVELS, INITIAL_ALERT_STATE } from '../domain/battery-alerts.js';
import type { BatteryDatabase } from './database.js';

type Db = Kysely<BatteryDatabase>;

/** Any batch transaction takes it first, so two never fold samples into the state at once. */
const SAMPLES_LOCK_KEY = 16;

const StateRow = z.object({
  last_ts: z.date(),
  drain: z.enum(DRAIN_LEVELS),
  full_since: z.date().nullable(),
  full_alerted: z.boolean(),
});

export async function lockSamples(db: Db): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(${SAMPLES_LOCK_KEY})`.execute(db);
}

export async function alertState(db: Db): Promise<AlertState> {
  const row = parseRow(
    StateRow,
    await db
      .selectFrom('alert_state')
      .select(['last_ts', 'drain', 'full_since', 'full_alerted'])
      .executeTakeFirst(),
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
export async function saveAlertState(db: Db, state: AlertState): Promise<void> {
  if (state.lastTsMs === null) {
    return;
  }
  await db
    .insertInto('alert_state')
    .values({
      last_ts: new Date(state.lastTsMs),
      drain: state.drain,
      full_since: state.fullSinceMs === null ? null : new Date(state.fullSinceMs),
      full_alerted: state.fullAlerted,
    })
    .onConflict((conflict) =>
      conflict.column('id').doUpdateSet((eb) => ({
        last_ts: eb.ref('excluded.last_ts'),
        drain: eb.ref('excluded.drain'),
        full_since: eb.ref('excluded.full_since'),
        full_alerted: eb.ref('excluded.full_alerted'),
      })),
    )
    .execute();
}
