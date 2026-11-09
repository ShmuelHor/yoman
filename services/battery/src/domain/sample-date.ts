/** `YYYY-MM-DD`, the leading part of an ISO 8601 timestamp. */
const ISO_DATE_LENGTH = 10;
const MS_PER_DAY = 86_400_000;

/**
 * The calendar date a sample belongs to, in the offset its timestamp carries.
 * The service never applies a time zone of its own: an agent that sends local
 * offsets gets local days, one that sends UTC gets UTC days.
 */
export function sampleDate(ts: string): string {
  return ts.slice(0, ISO_DATE_LENGTH);
}

/** The first date of a `days`-long window that ends on `now`'s UTC date. */
export function windowStart(now: Date, days: number): string {
  const start = new Date(now.getTime() - (days - 1) * MS_PER_DAY);
  return sampleDate(start.toISOString());
}
