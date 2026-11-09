import { BatteryStatus } from '@yoman/shared/ingest';
import { z } from 'zod';

import type { PowerReading } from '../domain/reading.js';
import type { StoredSample } from '../use-cases/store.js';
import { type Queryable, selectRow, selectRows } from './sql.js';

const SampleRow = z.object({
  ts: z.date(),
  local_date: z.iso.date(),
  energy_full_wh: z.number(),
  energy_full_design_wh: z.number(),
  cycle_count: z.number().int(),
  power_w: z.number(),
  capacity_pct: z.number(),
  status: BatteryStatus,
  health_pct: z.number(),
});
type SampleRow = z.infer<typeof SampleRow>;

const ReadingRow = z.object({ ts: z.date(), power_w: z.number(), status: BatteryStatus });
const TsRow = z.object({ ts: z.date() });

function toSample(row: SampleRow): StoredSample {
  return {
    ts: row.ts.toISOString(),
    tsMs: row.ts.getTime(),
    date: row.local_date,
    energyFullWh: row.energy_full_wh,
    energyFullDesignWh: row.energy_full_design_wh,
    cycleCount: row.cycle_count,
    powerW: row.power_w,
    capacityPct: row.capacity_pct,
    status: row.status,
    healthPct: row.health_pct,
  };
}

/** One statement for the whole batch: each column travels as one array parameter. */
export async function insertSamples(
  db: Queryable,
  samples: readonly StoredSample[],
): Promise<number> {
  const rows = await selectRows(
    db,
    TsRow,
    `INSERT INTO battery_samples (ts, local_date, energy_full_wh, energy_full_design_wh,
       cycle_count, power_w, capacity_pct, status, health_pct)
     SELECT * FROM unnest($1::timestamptz[], $2::date[], $3::float8[], $4::float8[],
       $5::integer[], $6::float8[], $7::float8[], $8::text[], $9::float8[])
     ON CONFLICT (ts) DO NOTHING RETURNING ts`,
    [
      samples.map((s) => s.ts),
      samples.map((s) => s.date),
      samples.map((s) => s.energyFullWh),
      samples.map((s) => s.energyFullDesignWh),
      samples.map((s) => s.cycleCount),
      samples.map((s) => s.powerW),
      samples.map((s) => s.capacityPct),
      samples.map((s) => s.status),
      samples.map((s) => s.healthPct),
    ],
  );
  return rows.length;
}

export async function samplesOn(db: Queryable, dates: readonly string[]): Promise<StoredSample[]> {
  const rows = await selectRows(
    db,
    SampleRow,
    `SELECT ts, local_date::text AS local_date, energy_full_wh, energy_full_design_wh,
       cycle_count, power_w, capacity_pct, status, health_pct
     FROM battery_samples WHERE local_date = ANY($1::date[]) ORDER BY ts`,
    [[...dates]],
  );
  return rows.map(toSample);
}

export async function latestSample(db: Queryable): Promise<StoredSample | null> {
  const row = await selectRow(
    db,
    SampleRow,
    `SELECT ts, local_date::text AS local_date, energy_full_wh, energy_full_design_wh,
       cycle_count, power_w, capacity_pct, status, health_pct
     FROM battery_samples ORDER BY ts DESC LIMIT 1`,
  );
  return row === null ? null : toSample(row);
}

export async function readingsBetween(
  db: Queryable,
  fromMs: number,
  toMs: number,
  limit: number,
): Promise<PowerReading[]> {
  const rows = await selectRows(
    db,
    ReadingRow,
    `SELECT ts, power_w, status FROM battery_samples
     WHERE ts >= $1 AND ts < $2 ORDER BY ts LIMIT $3`,
    [new Date(fromMs), new Date(toMs), limit],
  );
  return rows.map((row) => ({ tsMs: row.ts.getTime(), powerW: row.power_w, status: row.status }));
}
