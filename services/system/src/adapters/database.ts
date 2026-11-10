import type { Timestamp } from '@yoman/service-kit/sql';
import type { ColumnType, Generated } from 'kysely';

/** `bigint`: pg returns it as a string; the agent sends a safe integer. */
type Bigint = ColumnType<string, number, number>;

/** `jsonb` written as serialized JSON text; read back as the parsed value. */
type Json = ColumnType<unknown, string, string>;

export interface PressureSamplesTable {
  readonly ts: Timestamp;
  readonly cpu_some: number;
  readonly cpu_full: number;
  readonly memory_some: number;
  readonly memory_full: number;
  readonly io_some: number;
  readonly io_full: number;
  readonly mem_available_pct: number;
  readonly swap_active: boolean;
}

export interface ProcessSnapshotsTable {
  readonly ts: Timestamp;
  readonly pid: number;
  readonly comm: string;
  readonly container: string | null;
  readonly cpu_pct: number;
  readonly rss_bytes: Bigint;
  readonly io_bytes_per_sec: Bigint;
}

export interface IncidentsTable {
  readonly id: Generated<string>;
  readonly type: string;
  readonly start_at: Timestamp;
  readonly end_at: Timestamp | null;
  readonly peak: number;
  readonly culprits: Json;
  readonly pid: number | null;
}

export interface ConditionTracksTable {
  readonly type: string;
  readonly run_start: Timestamp | null;
  readonly run_peak: number;
  readonly last_at: Timestamp | null;
}

export interface SampleWatermarksTable {
  readonly kind: string;
  readonly recorded_until: Timestamp;
}

/** The `system` schema, as its migrations create it. */
export interface SystemDatabase {
  readonly pressure_samples: PressureSamplesTable;
  readonly process_snapshots: ProcessSnapshotsTable;
  readonly incidents: IncidentsTable;
  readonly condition_tracks: ConditionTracksTable;
  readonly sample_watermarks: SampleWatermarksTable;
}
