import type { CountedSession } from './rollup.js';

/**
 * An interruption up to this long (a glance at another app, a few missed
 * samples) does not break a streak. It is below the 120 s idle threshold, so
 * stepping away from the computer always does (SPEC §4.1).
 */
export const MAX_INTERRUPTION_MS = 60_000;

/** A stretch of continuous focus on one category. `id` is `null` until it is stored. */
export interface Streak {
  readonly id: string | null;
  readonly category: string;
  readonly startMs: number;
  readonly endMs: number;
}

/** A stored streak, as the merge reads it. */
export interface StoredStreak extends Streak {
  readonly id: string;
}

export interface StreakChanges {
  /** Stored streaks the new sessions joined into a longer one. */
  readonly removed: readonly string[];
  /** The streaks to store in their place, and new ones. */
  readonly added: readonly Streak[];
}

function byStart(a: Streak, b: Streak): number {
  return a.startMs - b.startMs;
}

function mergeCategory(stored: readonly StoredStreak[], fresh: readonly Streak[]): StreakChanges {
  const removed: string[] = [];
  const added: Streak[] = [];
  const flush = (group: Streak[]): void => {
    const first = group[0];
    if (first === undefined || group.every((streak) => streak.id !== null)) {
      return;
    }
    const startMs = Math.min(...group.map((streak) => streak.startMs));
    const endMs = Math.max(...group.map((streak) => streak.endMs));
    const kept = group.find((s) => s.id !== null && s.startMs === startMs && s.endMs === endMs);
    if (kept !== undefined) {
      return; // The sessions fell inside a stored streak; nothing changes.
    }
    removed.push(...group.flatMap((streak) => (streak.id === null ? [] : [streak.id])));
    added.push({ id: null, category: first.category, startMs, endMs });
  };

  let group: Streak[] = [];
  let groupEndMs = Number.NEGATIVE_INFINITY;
  for (const streak of [...stored, ...fresh].sort(byStart)) {
    if (streak.startMs - groupEndMs > MAX_INTERRUPTION_MS) {
      flush(group);
      group = [];
    }
    group.push(streak);
    groupEndMs = Math.max(groupEndMs, streak.endMs);
  }
  flush(group);
  return { removed, added };
}

/**
 * Joins new sessions into focus streaks: a streak is a stretch on one category
 * with no interruption longer than {@link MAX_INTERRUPTION_MS}. `stored` holds
 * the streaks near the sessions; any the sessions bridge become one. Joining
 * spans is order-independent, so batches may arrive in any order.
 * Uncategorized time is not focus, so it never forms a streak.
 */
export function mergeStreaks(
  stored: readonly StoredStreak[],
  sessions: readonly CountedSession[],
): StreakChanges {
  const categories = new Set(sessions.flatMap((s) => (s.category === null ? [] : [s.category])));
  const removed: string[] = [];
  const added: Streak[] = [];
  for (const category of categories) {
    const fresh = sessions.flatMap((s) =>
      s.category === category ? [{ id: null, category, startMs: s.startMs, endMs: s.endMs }] : [],
    );
    const changes = mergeCategory(
      stored.filter((streak) => streak.category === category),
      fresh,
    );
    removed.push(...changes.removed);
    added.push(...changes.added);
  }
  return { removed, added };
}
