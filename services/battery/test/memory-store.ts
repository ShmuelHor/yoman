import type { BatteryDay } from '@yoman/shared/battery';

import { type AlertState, INITIAL_ALERT_STATE } from '../src/domain/battery-alerts.js';
import type { BatteryStore, BatteryTransaction, StoredSample } from '../src/use-cases/store.js';

interface State {
  samples: StoredSample[];
  days: BatteryDay[];
  alertState: AlertState;
}

export interface MemoryStore extends BatteryStore {
  /** The committed state, for assertions. */
  readonly state: () => State;
}

function bind(state: State): BatteryTransaction {
  return {
    // One test drives the store at a time, so there is nothing to lock out.
    lockSamples: () => Promise.resolve(),
    insertSamples: async (samples): Promise<number> => {
      let inserted = 0;
      for (const sample of samples) {
        if (!state.samples.some((s) => s.tsMs === sample.tsMs)) {
          state.samples.push(sample);
          inserted += 1;
        }
      }
      return inserted;
    },
    samplesOn: async (dates) => state.samples.filter((s) => dates.includes(s.date)),
    latestSample: async () =>
      state.samples.reduce<StoredSample | null>(
        (latest, s) => (latest === null || s.tsMs > latest.tsMs ? s : latest),
        null,
      ),
    readingsBetween: async (fromMs, toMs, limit) =>
      state.samples
        .filter((s) => s.tsMs >= fromMs && s.tsMs < toMs)
        .sort((a, b) => a.tsMs - b.tsMs)
        .slice(0, limit)
        .map((s) => ({ tsMs: s.tsMs, powerW: s.powerW, status: s.status })),
    saveDays: async (days): Promise<void> => {
      const dates = new Set(days.map((day) => day.date));
      state.days = [...state.days.filter((day) => !dates.has(day.date)), ...days];
    },
    daysSince: async (date, limit) =>
      state.days
        .filter((day) => day.date >= date)
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(0, limit),
    alertState: async () => state.alertState,
    saveAlertState: async (next): Promise<void> => {
      state.alertState = next;
    },
  };
}

/** An in-memory store with the Postgres store's semantics, rolling back when `work` throws. */
export function createMemoryStore(initial: Partial<State> = {}): MemoryStore {
  let committed: State = { samples: [], days: [], alertState: INITIAL_ALERT_STATE, ...initial };
  return {
    state: () => committed,
    transaction: async <T>(work: (tx: BatteryTransaction) => Promise<T>): Promise<T> => {
      const draft = structuredClone(committed);
      const result = await work(bind(draft));
      committed = draft;
      return result;
    },
  };
}
