/**
 * Calendar days in the user's time zone. Rollups and streaks belong to a local
 * day, while sessions arrive as UTC instants, so every day boundary goes
 * through here. Pure: the zone data is Node's built-in ICU, read through
 * `@date-fns/tz`.
 */

import { TZDate, tz, tzOffset } from '@date-fns/tz';
import { addDays as addCalendarDays, format, getDay, parseISO } from 'date-fns';

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

/** Days from Sunday (0) to Saturday (6), like `Date.prototype.getUTCDay`. */
export function weekdayOf(date: LocalDateString): number {
  return getDay(parseISO(date, { in: calendar }));
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

/** The part of `[startMs, endMs)` that falls on one local day. */
export interface DaySlice {
  readonly date: LocalDateString;
  readonly ms: number;
}

/** Splits a time span at every local midnight it crosses. An empty span has no slices. */
export function splitByLocalDay(startMs: number, endMs: number, zone: string): DaySlice[] {
  const slices: DaySlice[] = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const date = localDateOf(cursor, zone);
    const nextDay = startOfLocalDay(addDays(date, 1), zone);
    const sliceEnd = Math.min(endMs, nextDay);
    slices.push({ date, ms: sliceEnd - cursor });
    cursor = sliceEnd;
  }
  return slices;
}
