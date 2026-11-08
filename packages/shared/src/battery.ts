import { z } from 'zod';
import { AppId, LocalDate, Percent, Seconds, Timestamp } from './common.js';
import { BatteryStatus } from './ingest.js';
import { LIMITS } from './limits.js';

export const BatteryNow = z.strictObject({
  ts: Timestamp,
  capacityPct: Percent,
  status: BatteryStatus,
  powerW: z.number().min(0).max(LIMITS.watts),
  /** From the average draw over the last 30 min; `null` while charging or without data. */
  minutesRemaining: z
    .int()
    .min(0)
    .max(LIMITS.minutesPerDay * LIMITS.daysPerWeek)
    .nullable(),
  /** energy_full / energy_full_design. */
  healthPct: Percent,
});
export type BatteryNow = z.infer<typeof BatteryNow>;

export const HealthTrendQuery = z.strictObject({
  days: z.coerce.number().int().min(1).max(LIMITS.trendDays),
});
export type HealthTrendQuery = z.infer<typeof HealthTrendQuery>;

export const BatteryDay = z.strictObject({
  date: LocalDate,
  healthPct: Percent,
  cycles: z.int().min(0).max(LIMITS.cycles),
  averageW: z.number().min(0).max(LIMITS.watts),
});
export type BatteryDay = z.infer<typeof BatteryDay>;

export const HealthTrend = z.strictObject({
  items: z.array(BatteryDay).max(LIMITS.trendDays),
});
export type HealthTrend = z.infer<typeof HealthTrend>;

export const AppPower = z.strictObject({
  appId: AppId,
  /** Average `power_now` while the app was in focus. */
  averageW: z.number().min(0).max(LIMITS.watts),
  seconds: Seconds,
});
export type AppPower = z.infer<typeof AppPower>;

export const PowerByApp = z.strictObject({ items: z.array(AppPower).max(LIMITS.listSize) });
export type PowerByApp = z.infer<typeof PowerByApp>;
