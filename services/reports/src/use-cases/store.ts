import type { LocalDateString } from '../domain/local-time.js';
import type { RollupEntry } from '../domain/rollup.js';
import type { StoredStreak, Streak } from '../domain/streaks.js';

/** What reports remembers of a counted session: enough to skip it when it comes again. */
export interface CountedSessionKey {
  readonly id: string;
  readonly endMs: number;
}

/**
 * Everything the use cases need from storage, inside one transaction. The
 * Postgres adapter implements it; tests use an in-memory one.
 */
export interface ReportsTransaction {
  /** Blocks other writers until the transaction ends, so two batches never merge one streak. */
  readonly lockWrites: () => Promise<void>;
  /** Records sessions as counted and returns the ids no earlier batch counted. */
  readonly markCounted: (sessions: readonly CountedSessionKey[]) => Promise<Set<string>>;
  /** Adds each entry's time to its day, app and category. */
  readonly addToRollups: (entries: readonly RollupEntry[]) => Promise<void>;
  /** Rollups of the days in `[from, to)`. */
  readonly rollups: (from: LocalDateString, to: LocalDateString) => Promise<RollupEntry[]>;
  /** Streaks of these categories that overlap `[fromMs, toMs]`. */
  readonly streaksNear: (
    categories: readonly string[],
    fromMs: number,
    toMs: number,
  ) => Promise<StoredStreak[]>;
  /** Streaks that started in `[fromMs, toMs)`. */
  readonly streaksStarting: (fromMs: number, toMs: number) => Promise<StoredStreak[]>;
  readonly replaceStreaks: (removed: readonly string[], added: readonly Streak[]) => Promise<void>;
}

export interface ReportsStore {
  /** Runs `work` in one transaction: committed when it resolves, rolled back when it throws. */
  readonly transaction: <T>(work: (tx: ReportsTransaction) => Promise<T>) => Promise<T>;
}
