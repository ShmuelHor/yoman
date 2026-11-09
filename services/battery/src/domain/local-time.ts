/**
 * Calendar days in the user's time zone. `battery_daily` rows belong to a local
 * day, while samples arrive as UTC instants, so every day boundary goes through
 * here. The same functions as the reports service's, so both count the same
 * days. Pure: the zone database is Node's built-in ICU.
 */

const MS_PER_SECOND = 1_000;
const MS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 10;

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

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  const cached = formatters.get(zone);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  formatters.set(zone, formatter);
  return formatter;
}

function part(
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  const value = parts.find((candidate) => candidate.type === type)?.value;
  if (value === undefined) {
    throw new Error(`The date format has no ${type}`);
  }
  return Number(value);
}

/** How far the zone's wall clock is ahead of UTC at `tsMs`, in milliseconds. */
function offsetMs(tsMs: number, zone: string): number {
  const parts = formatterFor(zone).formatToParts(tsMs);
  const wallClockAsUtc = Date.UTC(
    part(parts, 'year'),
    part(parts, 'month') - 1,
    part(parts, 'day'),
    part(parts, 'hour'),
    part(parts, 'minute'),
    part(parts, 'second'),
  );
  const wholeSeconds = Math.floor(tsMs / MS_PER_SECOND) * MS_PER_SECOND;
  return wallClockAsUtc - wholeSeconds;
}

/** The local calendar date of an instant. */
export function localDateOf(tsMs: number, zone: string): LocalDateString {
  return new Date(tsMs + offsetMs(tsMs, zone)).toISOString().slice(0, ISO_DATE_LENGTH);
}

/** Calendar arithmetic on a date, independent of any zone and of DST. */
export function addDays(date: LocalDateString, days: number): LocalDateString {
  return new Date(Date.parse(date) + days * MS_PER_DAY).toISOString().slice(0, ISO_DATE_LENGTH);
}
