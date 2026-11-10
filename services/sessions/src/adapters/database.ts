import type { Timestamp } from '@yoman/service-kit/sql';
import type { Generated } from 'kysely';

export interface AppsTable {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly category: string | null;
  readonly created_at: Generated<Date>;
}

export interface SessionsTable {
  readonly id: Generated<string>;
  readonly app_id: string;
  readonly start_at: Timestamp;
  readonly end_at: Timestamp;
  readonly title: string | null;
  readonly category: string | null;
  readonly closed: Generated<boolean>;
}

export interface CategoryRulesTable {
  readonly id: Generated<string>;
  readonly field: string;
  readonly match_type: string;
  readonly pattern: string;
  readonly category: string;
  readonly priority: number;
  readonly created_at: Generated<Date>;
}

export interface SampleWatermarkTable {
  readonly id: Generated<boolean>;
  readonly recorded_until: Timestamp;
}

/** The `sessions` schema, as its migrations create it. */
export interface SessionsDatabase {
  readonly apps: AppsTable;
  readonly sessions: SessionsTable;
  readonly category_rules: CategoryRulesTable;
  readonly sample_watermark: SampleWatermarkTable;
}
