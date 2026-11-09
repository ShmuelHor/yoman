import { BatteryDay } from '@yoman/shared/battery';

import { type Queryable, selectRows } from './sql.js';

export async function saveDays(db: Queryable, days: readonly BatteryDay[]): Promise<void> {
  if (days.length === 0) {
    return;
  }
  await db.query(
    `INSERT INTO battery_daily (date, health_pct, cycles, average_w)
     SELECT * FROM unnest($1::date[], $2::float8[], $3::integer[], $4::float8[])
     ON CONFLICT (date) DO UPDATE SET health_pct = EXCLUDED.health_pct,
       cycles = EXCLUDED.cycles, average_w = EXCLUDED.average_w`,
    [
      days.map((day) => day.date),
      days.map((day) => day.healthPct),
      days.map((day) => day.cycles),
      days.map((day) => day.averageW),
    ],
  );
}

export function daysSince(db: Queryable, date: string, limit: number): Promise<BatteryDay[]> {
  return selectRows(
    db,
    BatteryDay,
    `SELECT date::text AS date, health_pct AS "healthPct", cycles, average_w AS "averageW"
     FROM battery_daily WHERE date >= $1 ORDER BY date LIMIT $2`,
    [date, limit],
  );
}
