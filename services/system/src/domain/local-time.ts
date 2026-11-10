/**
 * Calendar days in the user's time zone. The timeline belongs to a local day,
 * while samples arrive as UTC instants, so every day boundary goes through
 * here. Pure: the zone data is Node's built-in ICU, read through `@date-fns/tz`.
 */

import { TZDate, tz, tzOffset } from '@date-fns/tz';
import { addDays as addCalendarDays, format, parseISO } from 'date-fns';

const MS_PER_MINUTE = 60_000;
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

/** How far the zone's wall clock is ahead of UTC at `tsMs`, in milliseconds. */
function offsetMs(tsMs: number, zone: string): number {
  return tzOffset(zone, new Date(tsMs)) * MS_PER_MINUTE;
}

/** The local calendar date of an instant. */
export function localDateOf(tsMs: number, zone: string): LocalDateString {
  return format(new TZDate(tsMs, zone), ISO_DATE);
}

/** Calendar arithmetic on a date, independent of any zone and of DST. */
export function addDays(date: LocalDateString, days: number): LocalDateString {
  return format(addCalendarDays(parseISO(date, { in: calendar }), days), ISO_DATE);
}

/**
 * The first instant of a local day. Usually local midnight, but a zone that
 * moves its clock at midnight has no 00:00 on that day, or has it twice; the
 * day then starts at the earliest instant that already belongs to it.
 */
export function startOfLocalDay(date: LocalDateString, zone: string): number {
  const midnightAsUtc = Date.parse(date);
  const first = midnightAsUtc - offsetMs(midnightAsUtc, zone);
  const second = midnightAsUtc - offsetMs(first, zone);
  const [earlier, later] = first <= second ? [first, second] : [second, first];
  return localDateOf(earlier, zone) === date ? earlier : later;
}

/** A half-open span of time, `[startMs, endMs)`. */
export interface TimeSpan {
  readonly startMs: number;
  readonly endMs: number;
}

/** The instants that belong to one local day, 23 to 25 hours around a DST change. */
export function localDaySpan(date: LocalDateString, zone: string): TimeSpan {
  return { startMs: startOfLocalDay(date, zone), endMs: startOfLocalDay(addDays(date, 1), zone) };
}
