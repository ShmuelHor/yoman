import { LIMITS } from '@yoman/shared/limits';
import type {
  AppTotal,
  CategoryTotal,
  DayReport,
  WeeklySummary,
  WeekReport,
} from '@yoman/shared/reports';

import { addDays, type LocalDateString, localDateOf, weekdayOf } from './local-time.js';
import type { RollupEntry } from './rollup.js';
import type { Streak } from './streaks.js';

const MS_PER_SECOND = 1_000;
/** Weeks start on Sunday, as in Israel, the product's default locale. */
const WEEK_STARTS_ON = 0;
const PERCENT = 100;
/** The bound of `Seconds` in `@yoman/shared/common`. */
const MAX_SECONDS = LIMITS.secondsPerWeek * LIMITS.rangeDays;

/**
 * Rounds to whole seconds. Only overlapping sessions, which the agent never
 * produces, could pass the contract's bound; a clamped total beats a 500.
 */
function toSeconds(ms: number): number {
  return Math.min(Math.round(ms / MS_PER_SECOND), MAX_SECONDS);
}

function sumMs(entries: readonly RollupEntry[]): number {
  return entries.reduce((total, entry) => total + entry.ms, 0);
}

function totalsBy<K extends string | null>(
  entries: readonly RollupEntry[],
  keyOf: (entry: RollupEntry) => K,
): [K, number][] {
  const totals = new Map<K, number>();
  for (const entry of entries) {
    const key = keyOf(entry);
    totals.set(key, (totals.get(key) ?? 0) + entry.ms);
  }
  // Largest first; ties in key order, so the result never depends on row order.
  return [...totals.entries()].sort(
    ([keyA, msA], [keyB, msB]) => msB - msA || String(keyA).localeCompare(String(keyB)),
  );
}

/** Apps by total time, largest first, at most one list's worth. */
export function topApps(entries: readonly RollupEntry[]): AppTotal[] {
  return totalsBy(entries, (entry) => entry.appId)
    .slice(0, LIMITS.listSize)
    .map(([appId, ms]) => ({ appId, seconds: toSeconds(ms) }));
}

function byCategory(entries: readonly RollupEntry[]): CategoryTotal[] {
  return totalsBy(entries, (entry) => entry.category)
    .slice(0, LIMITS.listSize)
    .map(([category, ms]) => ({ category, seconds: toSeconds(ms) }));
}

function longestStreakMs(streaks: readonly Streak[]): number {
  return Math.max(0, ...streaks.map((streak) => streak.endMs - streak.startMs));
}

/**
 * One day's report. `entries` and `streaks` may cover more days; only the
 * day's own are counted. A streak belongs to the day it started on.
 */
export function buildDayReport(
  date: LocalDateString,
  entries: readonly RollupEntry[],
  streaks: readonly Streak[],
  zone: string,
): DayReport {
  const own = entries.filter((entry) => entry.date === date);
  const ownStreaks = streaks.filter((streak) => localDateOf(streak.startMs, zone) === date);
  return {
    date,
    totalSeconds: toSeconds(sumMs(own)),
    byCategory: byCategory(own),
    topApps: topApps(own),
    longestFocusStreakSeconds: toSeconds(longestStreakMs(ownStreaks)),
  };
}

function inWeek(start: LocalDateString): (entry: RollupEntry) => boolean {
  const end = addDays(start, LIMITS.daysPerWeek);
  return (entry) => entry.date >= start && entry.date < end;
}

/**
 * The week starting at `start` against the week before it. `entries` must
 * cover both weeks. The change is `null` when the week before has no time.
 */
export function buildWeeklySummary(
  start: LocalDateString,
  entries: readonly RollupEntry[],
): WeeklySummary {
  const week = entries.filter(inWeek(start));
  const weekMs = sumMs(week);
  const previousMs = sumMs(entries.filter(inWeek(addDays(start, -LIMITS.daysPerWeek))));
  const [top] = totalsBy(
    week.filter((entry) => entry.category !== null),
    (entry) => entry.category,
  );
  return {
    totalSeconds: toSeconds(weekMs),
    changePct: previousMs === 0 ? null : ((weekMs - previousMs) / previousMs) * PERCENT,
    topCategory: top?.[0] ?? null,
  };
}

/** Seven day reports from `start`, the week's top apps and its summary. */
export function buildWeekReport(
  start: LocalDateString,
  entries: readonly RollupEntry[],
  streaks: readonly Streak[],
  zone: string,
): WeekReport {
  const days = Array.from({ length: LIMITS.daysPerWeek }, (_, offset) =>
    buildDayReport(addDays(start, offset), entries, streaks, zone),
  );
  return {
    start,
    days,
    topApps: topApps(entries.filter(inWeek(start))),
    summary: buildWeeklySummary(start, entries),
  };
}

/** The start of the last complete week before the one `today` is in. */
export function previousWeekStart(today: LocalDateString): LocalDateString {
  const daysIntoWeek =
    (weekdayOf(today) - WEEK_STARTS_ON + LIMITS.daysPerWeek) % LIMITS.daysPerWeek;
  return addDays(today, -daysIntoWeek - LIMITS.daysPerWeek);
}
