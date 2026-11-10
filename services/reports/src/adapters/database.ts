import type { LocalDate, Timestamp } from '@yoman/service-kit/sql';
import type { ColumnType, Generated } from 'kysely';

export interface CountedSessionsTable {
  readonly id: string;
  readonly end_at: Timestamp;
}

export interface DailyRollupsTable {
  readonly day: LocalDate;
  readonly app_id: string;
  readonly category: string | null;
  /** `bigint`, which pg returns as a string; read through a `float8` cast. */
  readonly active_ms: ColumnType<string, number, number>;
}

export interface FocusStreaksTable {
  readonly id: Generated<string>;
  readonly category: string;
  readonly start_at: Timestamp;
  readonly end_at: Timestamp;
}

/** The `reports` schema, as its migrations create it. */
export interface ReportsDatabase {
  readonly counted_sessions: CountedSessionsTable;
  readonly daily_rollups: DailyRollupsTable;
  readonly focus_streaks: FocusStreaksTable;
}
