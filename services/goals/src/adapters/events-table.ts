import { asText, parseRows, pgArray, unnest } from '@yoman/service-kit/sql';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import type { Breach } from '../domain/breach-alert.js';
import type { GoalEventsTable, GoalsDatabase } from './database.js';

type Db = Kysely<GoalsDatabase>;

const EventRow = z.object({ goal_id: z.string(), date: z.iso.date() });

function key(goalId: string, date: string): string {
  return `${goalId}/${date}`;
}

/**
 * Inserts one event per breach. The primary key turns a second breach of the
 * same goal on the same day into a no-op, and the join drops goals deleted
 * since they were read, so only the newly recorded breaches come back.
 */
export async function recordBreaches(db: Db, breaches: readonly Breach[]): Promise<Breach[]> {
  if (breaches.length === 0) {
    return [];
  }
  const batch = unnest<Omit<GoalEventsTable, 'created_at'>, 't'>('t', {
    goal_id: pgArray(
      'uuid',
      breaches.map((breach) => breach.goal.id),
    ),
    date: pgArray(
      'date',
      breaches.map((breach) => breach.date),
    ),
    minutes_used: pgArray(
      'integer',
      breaches.map((breach) => breach.minutesUsed),
    ),
    target_minutes: pgArray(
      'integer',
      breaches.map((breach) => breach.goal.minutes),
    ),
  });
  const rows = parseRows(
    EventRow,
    await db
      .insertInto('goal_events')
      .columns(['goal_id', 'date', 'minutes_used', 'target_minutes'])
      .expression((eb) =>
        eb
          .selectFrom(batch)
          .innerJoin('goals', 'goals.id', 't.goal_id')
          .select(['t.goal_id', 't.date', 't.minutes_used', 't.target_minutes']),
      )
      .onConflict((conflict) => conflict.columns(['goal_id', 'date']).doNothing())
      .returning([asText('goal_id', 'goal_id'), asText('date', 'date')])
      .execute(),
  );
  const recorded = new Set(rows.map((row) => key(row.goal_id, row.date)));
  return breaches.filter((breach) => recorded.has(key(breach.goal.id, breach.date)));
}
