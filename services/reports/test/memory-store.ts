import { randomUUID } from 'node:crypto';

import type { RollupEntry } from '../src/domain/rollup.js';
import type { StoredStreak } from '../src/domain/streaks.js';
import type { ReportsStore, ReportsTransaction } from '../src/use-cases/store.js';

interface State {
  counted: Map<string, number>;
  rollups: RollupEntry[];
  streaks: StoredStreak[];
}

export interface MemoryStore extends ReportsStore {
  /** The committed state, for assertions. */
  readonly state: () => State;
}

function sameKey(a: RollupEntry, b: RollupEntry): boolean {
  return a.date === b.date && a.appId === b.appId && a.category === b.category;
}

function bind(state: State): ReportsTransaction {
  return {
    lockWrites: () => Promise.resolve(),
    markCounted: async (sessions): Promise<Set<string>> => {
      const fresh = new Set<string>();
      for (const { id, endMs } of sessions) {
        if (!state.counted.has(id)) {
          state.counted.set(id, endMs);
          fresh.add(id);
        }
      }
      return fresh;
    },
    addToRollups: async (entries): Promise<void> => {
      for (const entry of entries) {
        const existing = state.rollups.find((row) => sameKey(row, entry));
        state.rollups = [
          ...state.rollups.filter((row) => row !== existing),
          { ...entry, ms: (existing?.ms ?? 0) + entry.ms },
        ];
      }
    },
    rollups: async (from, to) =>
      state.rollups.filter((entry) => entry.date >= from && entry.date < to),
    streaksNear: async (categories, fromMs, toMs) =>
      state.streaks.filter(
        (streak) =>
          categories.includes(streak.category) && streak.startMs <= toMs && streak.endMs >= fromMs,
      ),
    streaksStarting: async (fromMs, toMs) =>
      state.streaks.filter((streak) => streak.startMs >= fromMs && streak.startMs < toMs),
    replaceStreaks: async (removed, added): Promise<void> => {
      state.streaks = [
        ...state.streaks.filter((streak) => !removed.includes(streak.id)),
        ...added.map((streak) => ({ ...streak, id: randomUUID() })),
      ];
    },
  };
}

/** An in-memory store with the Postgres store's semantics, rolling back when `work` throws. */
export function createMemoryStore(initial: Partial<State> = {}): MemoryStore {
  let committed: State = { counted: new Map(), rollups: [], streaks: [], ...initial };
  return {
    state: () => committed,
    transaction: async <T>(work: (tx: ReportsTransaction) => Promise<T>): Promise<T> => {
      const draft = structuredClone(committed);
      const result = await work(bind(draft));
      committed = draft;
      return result;
    },
  };
}
