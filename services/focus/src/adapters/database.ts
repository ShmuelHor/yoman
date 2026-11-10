import type { Timestamp } from '@yoman/service-kit/sql';
import type { ColumnType, Generated } from 'kysely';

/** `jsonb` written as serialized JSON text; read back as the parsed value. */
type Json = ColumnType<unknown, string, string>;

export interface ProfilesTable {
  readonly id: Generated<string>;
  readonly name: string;
  readonly muted_apps: string[];
  readonly exceptions: string[];
  readonly mute_new_apps: boolean;
  readonly created_at: Generated<Date>;
}

export interface FocusSessionsTable {
  readonly id: Generated<string>;
  readonly profile_id: string | null;
  readonly source: string;
  readonly started_at: Timestamp;
  readonly ends_at: Timestamp;
  readonly ended_at: Timestamp | null;
  readonly muted_apps: string[];
}

export interface KnownAppsTable {
  readonly app_id: string;
  readonly name: string | null;
  readonly source: string;
  readonly first_seen_at: Generated<Date>;
}

export interface AlertPolicyTable {
  readonly type: string;
  readonly level: string;
}

export interface AlertRateLimitsTable {
  readonly alert_key: string;
  readonly accepted_at: Timestamp;
}

export interface QueuedAlertsTable {
  /** `bigint`, which pg returns as a string. */
  readonly id: Generated<string>;
  readonly alert_key: string;
  readonly type: string;
  readonly level: string;
  readonly ts: Timestamp;
  readonly params: Json;
  readonly queued_at: Timestamp;
}

export interface SchedulesTable {
  readonly id: Generated<string>;
  readonly profile_id: string;
  readonly days: number[];
  readonly start_at: string;
  readonly end_at: string;
  readonly enabled: boolean;
  readonly created_at: Generated<Date>;
}

/** The `focus` schema, as its migrations create it. */
export interface FocusDatabase {
  readonly profiles: ProfilesTable;
  readonly focus_sessions: FocusSessionsTable;
  readonly known_apps: KnownAppsTable;
  readonly alert_policy: AlertPolicyTable;
  readonly alert_rate_limits: AlertRateLimitsTable;
  readonly queued_alerts: QueuedAlertsTable;
  readonly schedules: SchedulesTable;
}
