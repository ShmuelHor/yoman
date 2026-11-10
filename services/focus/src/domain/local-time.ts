/**
 * Wall-clock times in the user's time zone. `yoman focus until 14:30` names a
 * local time, while the service stores UTC instants, so the conversion goes
 * through here. Pure: the zone data is Node's built-in ICU, read through
 * `@date-fns/tz`.
 */

import { TZDate, tz, tzOffset } from '@date-fns/tz';
import { addDays, format, parseISO } from 'date-fns';

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const MS_PER_DAY = 86_400_000;
const ISO_DATE = 'yyyy-MM-dd';

/** Calendar dates carry no zone; reading them as UTC keeps their arithmetic clear of DST. */
const calendar = tz('UTC');

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

/** The zone's wall clock at `tsMs`, written as if it were a UTC instant. */
function wallClockAsUtc(tsMs: number, zone: string): number {
  return tsMs + offsetMs(tsMs, zone);
}

function localDateOf(tsMs: number, zone: string): string {
  return format(new TZDate(tsMs, zone), ISO_DATE);
}

/** Minutes since local midnight, `HH:MM` → `HH * 60 + MM`. */
function minutesOf(clock: string): number {
  const [hours = 0, minutes = 0] = clock.split(':').map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

/**
 * The instant a local date shows a wall-clock time. A time the clock skips
 * on a DST change is moved forward by the length of the gap (02:30 becomes
 * 03:30), and a time it shows twice resolves to the earlier one.
 */
function instantOf(date: string, clock: string, zone: string): number {
  const wallMs = Date.parse(date) + minutesOf(clock) * MS_PER_MINUTE;
  // The offsets a day either side bracket any DST change near this time.
  const before = wallMs - offsetMs(wallMs - MS_PER_DAY, zone);
  const after = wallMs - offsetMs(wallMs + MS_PER_DAY, zone);
  const shown = [before, after].filter((candidate) => wallClockAsUtc(candidate, zone) === wallMs);
  // In a gap neither instant shows the time; the offset from before the gap moves it forward.
  return shown.length === 0 ? before : Math.min(...shown);
}

/** The next instant after `nowMs` at which the zone's clock shows `clock` (`HH:MM`). */
export function nextOccurrence(clock: string, nowMs: number, zone: string): number {
  const today = localDateOf(nowMs, zone);
  const candidate = instantOf(today, clock, zone);
  if (candidate > nowMs) {
    return candidate;
  }
  const tomorrow = format(addDays(parseISO(today, { in: calendar }), 1), ISO_DATE);
  return instantOf(tomorrow, clock, zone);
}
