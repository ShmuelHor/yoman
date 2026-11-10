import { asText, parseRow, parseRows, pgArray, unnest } from '@yoman/service-kit/sql';
import { BatteryStatus } from '@yoman/shared/ingest';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import type { PowerReading } from '../domain/reading.js';
import type { StoredSample } from '../use-cases/store.js';
import type { BatteryDatabase, BatterySamplesTable } from './database.js';

type Db = Kysely<BatteryDatabase>;

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

const SAMPLE_COLUMNS = [
  'ts',
  asText('local_date', 'local_date'),
  'energy_full_wh',
  'energy_full_design_wh',
  'cycle_count',
  'power_w',
  'capacity_pct',
  'status',
  'health_pct',
] as const;

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
export async function insertSamples(db: Db, samples: readonly StoredSample[]): Promise<number> {
  const rows = parseRows(
    TsRow,
    await db
      .insertInto('battery_samples')
      .columns([
        'ts',
        'local_date',
        'energy_full_wh',
        'energy_full_design_wh',
        'cycle_count',
        'power_w',
        'capacity_pct',
        'status',
        'health_pct',
      ])
      .expression((eb) =>
        eb
          .selectFrom(
            unnest<BatterySamplesTable, 't'>('t', {
              ts: pgArray(
                'timestamptz',
                samples.map((s) => s.ts),
              ),
              local_date: pgArray(
                'date',
                samples.map((s) => s.date),
              ),
              energy_full_wh: pgArray(
                'float8',
                samples.map((s) => s.energyFullWh),
              ),
              energy_full_design_wh: pgArray(
                'float8',
                samples.map((s) => s.energyFullDesignWh),
              ),
              cycle_count: pgArray(
                'integer',
                samples.map((s) => s.cycleCount),
              ),
              power_w: pgArray(
                'float8',
                samples.map((s) => s.powerW),
              ),
              capacity_pct: pgArray(
                'float8',
                samples.map((s) => s.capacityPct),
              ),
              status: pgArray(
                'text',
                samples.map((s) => s.status),
              ),
              health_pct: pgArray(
                'float8',
                samples.map((s) => s.healthPct),
              ),
            }),
          )
          .selectAll(),
      )
      .onConflict((conflict) => conflict.column('ts').doNothing())
      .returning('ts')
      .execute(),
  );
  return rows.length;
}

export async function samplesOn(db: Db, dates: readonly string[]): Promise<StoredSample[]> {
  const rows = parseRows(
    SampleRow,
    await db
      .selectFrom('battery_samples')
      .select(SAMPLE_COLUMNS)
      .where('local_date', '=', (eb) => eb.fn.any(pgArray('date', dates)))
      .orderBy('ts')
      .execute(),
  );
  return rows.map(toSample);
}

export async function latestSample(db: Db): Promise<StoredSample | null> {
  const row = parseRow(
    SampleRow,
    await db
      .selectFrom('battery_samples')
      .select(SAMPLE_COLUMNS)
      .orderBy('ts', 'desc')
      .limit(1)
      .executeTakeFirst(),
  );
  return row === null ? null : toSample(row);
}

export async function readingsBetween(
  db: Db,
  fromMs: number,
  toMs: number,
  limit: number,
): Promise<PowerReading[]> {
  const rows = parseRows(
    ReadingRow,
    await db
      .selectFrom('battery_samples')
      .select(['ts', 'power_w', 'status'])
      .where('ts', '>=', new Date(fromMs))
      .where('ts', '<', new Date(toMs))
      .orderBy('ts')
      .limit(limit)
      .execute(),
  );
  return rows.map((row) => ({ tsMs: row.ts.getTime(), powerW: row.power_w, status: row.status }));
}
