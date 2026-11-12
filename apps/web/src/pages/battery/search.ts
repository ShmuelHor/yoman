import { z } from 'zod';

const WEEK = 7;
const MONTH = 30;
/** The longest is the gateway's 92-day limit on a time range, rounded down to a quarter. */
const QUARTER = 90;

export const RANGE_DAYS = [WEEK, MONTH, QUARTER] as const;
export type RangeDays = (typeof RANGE_DAYS)[number];
export const DEFAULT_RANGE_DAYS: RangeDays = MONTH;

/** `?days=` of the page. A missing or hand-edited value falls back to the default. */
export const BatterySearch = z.object({
  days: z
    .union([z.literal(WEEK), z.literal(MONTH), z.literal(QUARTER)])
    .catch(DEFAULT_RANGE_DAYS)
    .default(DEFAULT_RANGE_DAYS),
});
export type BatterySearch = z.infer<typeof BatterySearch>;
