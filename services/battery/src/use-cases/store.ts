import type { BatteryDay } from '@yoman/shared/battery';
import type { BatteryStatus } from '@yoman/shared/ingest';

import type { AlertState } from '../domain/battery-alerts.js';
import type { DaySample } from '../domain/daily.js';
import type { PowerReading } from '../domain/reading.js';

/** A sample as stored: the agent's values plus its date and health. */
export interface StoredSample extends DaySample {
  readonly ts: string;
  readonly date: string;
  readonly energyFullWh: number;
  readonly energyFullDesignWh: number;
  readonly capacityPct: number;
  readonly status: BatteryStatus;
}

/**
 * Everything the use cases need from storage, inside one transaction. The
 * Postgres adapter implements it; tests use an in-memory one.
 */
export interface BatteryTransaction {
  /** Blocks other batches until the transaction ends, so alert state never interleaves. */
  readonly lockSamples: () => Promise<void>;
  /** Stores samples whose timestamp is new and returns how many that was. */
  readonly insertSamples: (samples: readonly StoredSample[]) => Promise<number>;
  /** Every stored sample on the given dates. */
  readonly samplesOn: (dates: readonly string[]) => Promise<StoredSample[]>;
  /** The newest stored sample, or `null` before the first one. */
  readonly latestSample: () => Promise<StoredSample | null>;
  /** Readings in `[fromMs, toMs)`, oldest first, at most `limit`. */
  readonly readingsBetween: (
    fromMs: number,
    toMs: number,
    limit: number,
  ) => Promise<PowerReading[]>;

  /** Inserts or replaces each day's row. */
  readonly saveDays: (days: readonly BatteryDay[]) => Promise<void>;
  /** Days from `date` on, oldest first, at most `limit`. */
  readonly daysSince: (date: string, limit: number) => Promise<BatteryDay[]>;

  readonly alertState: () => Promise<AlertState>;
  readonly saveAlertState: (state: AlertState) => Promise<void>;
}

export interface BatteryStore {
  /** Runs `work` in one transaction: committed when it resolves, rolled back when it throws. */
  readonly transaction: <T>(work: (tx: BatteryTransaction) => Promise<T>) => Promise<T>;
}
