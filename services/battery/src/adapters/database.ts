import type { LocalDate, Timestamp } from '@yoman/service-kit/sql';
import type { Generated } from 'kysely';

export interface BatterySamplesTable {
  readonly ts: Timestamp;
  readonly local_date: LocalDate;
  readonly energy_full_wh: number;
  readonly energy_full_design_wh: number;
  readonly cycle_count: number;
  readonly power_w: number;
  readonly capacity_pct: number;
  readonly status: string;
  readonly health_pct: number;
}

export interface BatteryDailyTable {
  readonly date: LocalDate;
  readonly health_pct: number;
  readonly cycles: number;
  readonly average_w: number;
}

export interface AlertStateTable {
  readonly id: Generated<boolean>;
  readonly last_ts: Timestamp;
  readonly drain: string;
  readonly full_since: Timestamp | null;
  readonly full_alerted: boolean;
}

/** The `battery` schema, as its migrations create it. */
export interface BatteryDatabase {
  readonly battery_samples: BatterySamplesTable;
  readonly battery_daily: BatteryDailyTable;
  readonly alert_state: AlertStateTable;
}
