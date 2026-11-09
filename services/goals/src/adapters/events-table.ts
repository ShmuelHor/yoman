import { z } from 'zod';

import type { Breach } from '../domain/breach-alert.js';
import { type Queryable, selectRows } from './sql.js';

const EventRow = z.object({ goal_id: z.string(), date: z.iso.date() });

function key(goalId: string, date: string): string {
  return `${goalId}/${date}`;
}

/**
 * Inserts one event per breach. The primary key turns a second breach of the
 * same goal on the same day into a no-op, and the join drops goals deleted
 * since they were read, so only the newly recorded breaches come back.
 */
export async function recordBreaches(
  db: Queryable,
  breaches: readonly Breach[],
): Promise<Breach[]> {
  if (breaches.length === 0) {
    return [];
  }
  const rows = await selectRows(
    db,
    EventRow,
    `INSERT INTO goal_events (goal_id, date, minutes_used, target_minutes)
     SELECT t.goal_id, t.date, t.minutes_used, t.target_minutes
     FROM unnest($1::uuid[], $2::date[], $3::integer[], $4::integer[])
       AS t(goal_id, date, minutes_used, target_minutes)
     JOIN goals ON goals.id = t.goal_id
     ON CONFLICT (goal_id, date) DO NOTHING
     RETURNING goal_id::text, date::text`,
    [
      breaches.map((breach) => breach.goal.id),
      breaches.map((breach) => breach.date),
      breaches.map((breach) => breach.minutesUsed),
      breaches.map((breach) => breach.goal.minutes),
    ],
  );
  const recorded = new Set(rows.map((row) => key(row.goal_id, row.date)));
  return breaches.filter((breach) => recorded.has(key(breach.goal.id, breach.date)));
}
