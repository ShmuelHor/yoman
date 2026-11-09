import { type LocalDateString, splitByLocalDay } from './local-time.js';

/** A closed session as reports counts it: when, which app, under which category. */
export interface CountedSession {
  readonly appId: string;
  readonly category: string | null;
  readonly startMs: number;
  readonly endMs: number;
}

/** Time one app spent under one category on one local day. */
export interface RollupEntry {
  readonly date: LocalDateString;
  readonly appId: string;
  readonly category: string | null;
  readonly ms: number;
}

function keyOf(entry: Omit<RollupEntry, 'ms'>): string {
  return JSON.stringify([entry.date, entry.appId, entry.category]);
}

/**
 * Totals sessions per local day, app and category. A session that crosses
 * midnight counts on both days, each with the part that fell on it.
 */
export function rollUp(sessions: readonly CountedSession[], zone: string): RollupEntry[] {
  const totals = new Map<string, RollupEntry>();
  for (const session of sessions) {
    for (const slice of splitByLocalDay(session.startMs, session.endMs, zone)) {
      const entry = { date: slice.date, appId: session.appId, category: session.category };
      const key = keyOf(entry);
      totals.set(key, { ...entry, ms: (totals.get(key)?.ms ?? 0) + slice.ms });
    }
  }
  return [...totals.values()];
}
