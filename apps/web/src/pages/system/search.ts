import { format } from 'date-fns';
import { z } from 'zod';

const WEEK = 7;
const MONTH = 30;
/** The longest is the gateway's 92-day limit on a time range, rounded down to a quarter. */
const QUARTER = 90;

export const RANGE_DAYS = [WEEK, MONTH, QUARTER] as const;
export type RangeDays = (typeof RANGE_DAYS)[number];
export const DEFAULT_RANGE_DAYS: RangeDays = MONTH;

/** The local calendar day as `YYYY-MM-DD`, the format of the `date` the gateway expects. */
export function localDate(now: Date): string {
  return format(now, 'yyyy-MM-dd');
}

/**
 * `?date=` is the day the load chart shows; `?days=` is how far back the
 * incident history and the recurring culprits look. A missing or hand-edited
 * value falls back to today and to 30 days, so a bad URL never breaks the page.
 */
export const SystemSearch = z.object({
  date: z.iso
    .date()
    .catch(() => localDate(new Date()))
    .default(() => localDate(new Date())),
  days: z
    .union([z.literal(WEEK), z.literal(MONTH), z.literal(QUARTER)])
    .catch(DEFAULT_RANGE_DAYS)
    .default(DEFAULT_RANGE_DAYS),
});
export type SystemSearch = z.infer<typeof SystemSearch>;
