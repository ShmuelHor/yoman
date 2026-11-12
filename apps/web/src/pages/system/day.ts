import { addDays, endOfDay, isAfter, startOfDay } from 'date-fns';

import { localDate } from './search.js';

/** The local calendar day of a `YYYY-MM-DD` string; parsing it as UTC would shift the day. */
export function parseLocalDate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

/** The day before (`-1`) or after (`1`) `date`. */
export function shiftDate(date: string, delta: -1 | 1): string {
  return localDate(addDays(parseLocalDate(date), delta));
}

/** Whether `date` is later than `now`'s day, which has no data yet. */
export function isFuture(date: string, now: Date): boolean {
  return isAfter(parseLocalDate(date), startOfDay(now));
}

/** The first and last moment of the local day `date`; the chart's time axis. */
export function dayBounds(date: string): { start: Date; end: Date } {
  const day = parseLocalDate(date);
  return { start: startOfDay(day), end: endOfDay(day) };
}
