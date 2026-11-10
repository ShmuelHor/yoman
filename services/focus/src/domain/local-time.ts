/**
 * Wall-clock times in the user's time zone. `yoman focus until 14:30` names a
 * local time, while the service stores UTC instants, so the conversion goes
 * through here. Pure: the zone database is Node's built-in ICU.
 */

const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const MS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 10;

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

/** The zone's wall clock at `tsMs`, written as if it were a UTC instant. */
function wallClockAsUtc(tsMs: number, zone: string): number {
  const parts = formatterFor(zone).formatToParts(tsMs);
  return Date.UTC(
    part(parts, 'year'),
    part(parts, 'month') - 1,
    part(parts, 'day'),
    part(parts, 'hour'),
    part(parts, 'minute'),
    part(parts, 'second'),
  );
}

/** How far the zone's wall clock is ahead of UTC at `tsMs`, in milliseconds. */
function offsetMs(tsMs: number, zone: string): number {
  const wholeSeconds = Math.floor(tsMs / MS_PER_SECOND) * MS_PER_SECOND;
  return wallClockAsUtc(tsMs, zone) - wholeSeconds;
}

function localDateOf(tsMs: number, zone: string): string {
  return new Date(tsMs + offsetMs(tsMs, zone)).toISOString().slice(0, ISO_DATE_LENGTH);
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
  const tomorrow = new Date(Date.parse(today) + MS_PER_DAY).toISOString().slice(0, ISO_DATE_LENGTH);
  return instantOf(tomorrow, clock, zone);
}
