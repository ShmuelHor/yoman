import { asText, parseRows, pgArray, unnest } from '@yoman/service-kit/sql';
import { BatteryDay } from '@yoman/shared/battery';
import type { Kysely } from 'kysely';

import type { BatteryDailyTable, BatteryDatabase } from './database.js';

type Db = Kysely<BatteryDatabase>;

export async function saveDays(db: Db, days: readonly BatteryDay[]): Promise<void> {
  if (days.length === 0) {
    return;
  }
  await db
    .insertInto('battery_daily')
    .columns(['date', 'health_pct', 'cycles', 'average_w'])
    .expression((eb) =>
      eb
        .selectFrom(
          unnest<BatteryDailyTable, 't'>('t', {
            date: pgArray(
              'date',
              days.map((day) => day.date),
            ),
            health_pct: pgArray(
              'float8',
              days.map((day) => day.healthPct),
            ),
            cycles: pgArray(
              'integer',
              days.map((day) => day.cycles),
            ),
            average_w: pgArray(
              'float8',
              days.map((day) => day.averageW),
            ),
          }),
        )
        .selectAll(),
    )
    .onConflict((conflict) =>
      conflict.column('date').doUpdateSet((eb) => ({
        health_pct: eb.ref('excluded.health_pct'),
        cycles: eb.ref('excluded.cycles'),
        average_w: eb.ref('excluded.average_w'),
      })),
    )
    .execute();
}

export async function daysSince(db: Db, date: string, limit: number): Promise<BatteryDay[]> {
  return parseRows(
    BatteryDay,
    await db
      .selectFrom('battery_daily')
      .select([
        asText('date', 'date'),
        'health_pct as healthPct',
        'cycles',
        'average_w as averageW',
      ])
      .where('date', '>=', date)
      .orderBy('date')
      .limit(limit)
      .execute(),
  );
}
