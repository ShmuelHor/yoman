import { LIMITS } from '@yoman/shared/limits';
import type { AppTotal, DayReport, WeeklySummary, WeekReport } from '@yoman/shared/reports';

import {
  addDays,
  type LocalDateString,
  localDateOf,
  startOfLocalDay,
} from '../domain/local-time.js';
import {
  buildDayReport,
  buildWeeklySummary,
  buildWeekReport,
  previousWeekStart,
  topApps,
} from '../domain/reports.js';
import type { ReportsStore } from './store.js';

/** One local day's report. */
export function dayReport(
  store: ReportsStore,
  date: LocalDateString,
  zone: string,
): Promise<DayReport> {
  return store.transaction(async (tx) => {
    const next = addDays(date, 1);
    const entries = await tx.rollups(date, next);
    const streaks = await tx.streaksStarting(
      startOfLocalDay(date, zone),
      startOfLocalDay(next, zone),
    );
    return buildDayReport(date, entries, streaks, zone);
  });
}

/** The report of the local day `now` falls on. */
export function todayReport(store: ReportsStore, now: Date, zone: string): Promise<DayReport> {
  return dayReport(store, localDateOf(now.getTime(), zone), zone);
}

/** Seven days from `start`, compared with the seven before. */
export function weekReport(
  store: ReportsStore,
  start: LocalDateString,
  zone: string,
): Promise<WeekReport> {
  return store.transaction(async (tx) => {
    const end = addDays(start, LIMITS.daysPerWeek);
    const entries = await tx.rollups(addDays(start, -LIMITS.daysPerWeek), end);
    const streaks = await tx.streaksStarting(
      startOfLocalDay(start, zone),
      startOfLocalDay(end, zone),
    );
    return buildWeekReport(start, entries, streaks, zone);
  });
}

/** The summary of the last complete week before the one `now` is in. */
export function lastWeekSummary(
  store: ReportsStore,
  now: Date,
  zone: string,
): Promise<WeeklySummary> {
  const start = previousWeekStart(localDateOf(now.getTime(), zone));
  return store.transaction(async (tx) => {
    const entries = await tx.rollups(
      addDays(start, -LIMITS.daysPerWeek),
      addDays(start, LIMITS.daysPerWeek),
    );
    return buildWeeklySummary(start, entries);
  });
}

/** Apps by total time over the local days `[from, to)`. */
export function topAppsBetween(
  store: ReportsStore,
  from: LocalDateString,
  to: LocalDateString,
): Promise<AppTotal[]> {
  return store.transaction(async (tx) => topApps(await tx.rollups(from, to)));
}
