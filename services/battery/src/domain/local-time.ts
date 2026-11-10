/**
 * Calendar days in the user's time zone. `battery_daily` rows belong to a local
 * day, while samples arrive as UTC instants, so every day boundary goes through
 * here. The same functions as the reports service's, so both count the same
 * days. Pure: the zone data is Node's built-in ICU, read through `@date-fns/tz`.
 */

import { TZDate, tz } from '@date-fns/tz';
import { addDays as addCalendarDays, format, parseISO } from 'date-fns';

const ISO_DATE = 'yyyy-MM-dd';

/** Calendar dates carry no zone; reading them as UTC keeps their arithmetic clear of DST. */
const calendar = tz('UTC');

/** Matches `LocalDate` from `@yoman/shared/common`: `YYYY-MM-DD`. */
export type LocalDateString = string;

/** True when `zone` is an IANA time zone this runtime knows, such as `Asia/Jerusalem`. */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The local calendar date of an instant. */
export function localDateOf(tsMs: number, zone: string): LocalDateString {
  return format(new TZDate(tsMs, zone), ISO_DATE);
}

/** Calendar arithmetic on a date, independent of any zone and of DST. */
export function addDays(date: LocalDateString, days: number): LocalDateString {
  return format(addCalendarDays(parseISO(date, { in: calendar }), days), ISO_DATE);
}
