import type { LocalDate } from '@yoman/service-kit/sql';
import type { Generated } from 'kysely';

export interface GoalsTable {
  readonly id: Generated<string>;
  readonly type: string;
  readonly target_kind: string;
  readonly target: string;
  readonly minutes: number;
  readonly days: number[];
  readonly created_at: Generated<Date>;
}

export interface DailyUsageTable {
  readonly date: LocalDate;
  readonly target_kind: string;
  readonly target: string;
  readonly seconds: number;
}

export interface EvaluationWatermarkTable {
  readonly id: Generated<boolean>;
  readonly latest_date: LocalDate;
}

export interface GoalEventsTable {
  readonly goal_id: string;
  readonly date: LocalDate;
  readonly minutes_used: number;
  readonly target_minutes: number;
  readonly created_at: Generated<Date>;
}

/** The `goals` schema, as its migrations create it. */
export interface GoalsDatabase {
  readonly goals: GoalsTable;
  readonly daily_usage: DailyUsageTable;
  readonly evaluation_watermark: EvaluationWatermarkTable;
  readonly goal_events: GoalEventsTable;
}
