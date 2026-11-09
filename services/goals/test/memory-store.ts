import { randomUUID } from 'node:crypto';
import type { Goal } from '@yoman/shared/goals';

import type { Breach } from '../src/domain/breach-alert.js';
import { type DayUsage, EMPTY_USAGE } from '../src/domain/evaluate-goals.js';
import type { GoalsStore, GoalsTransaction } from '../src/use-cases/store.js';

interface StoredUsage {
  readonly apps: Record<string, number>;
  readonly categories: Record<string, number>;
}

interface State {
  goals: Goal[];
  /** Plain records, so `structuredClone` can copy the draft. */
  usage: Record<string, StoredUsage>;
  latestDate: string | null;
  /** `goalId/date` of every recorded breach. */
  events: string[];
}

export interface MemoryStore extends GoalsStore {
  /** The committed state, for assertions. */
  readonly state: () => State;
}

function eventKey(breach: Breach): string {
  return `${breach.goal.id}/${breach.date}`;
}

function bind(state: State): GoalsTransaction {
  return {
    listGoals: async (limit) => state.goals.slice(0, limit),
    countGoals: async () => state.goals.length,
    createGoal: async (input): Promise<Goal> => {
      const goal = { id: randomUUID(), ...input };
      state.goals.push(goal);
      return goal;
    },
    updateGoal: async (id, input): Promise<Goal | null> => {
      if (!state.goals.some((goal) => goal.id === id)) {
        return null;
      }
      const updated = { id, ...input };
      state.goals = state.goals.map((goal) => (goal.id === id ? updated : goal));
      return updated;
    },
    deleteGoal: async (id): Promise<boolean> => {
      const before = state.goals.length;
      state.goals = state.goals.filter((goal) => goal.id !== id);
      state.events = state.events.filter((key) => !key.startsWith(`${id}/`));
      return state.goals.length < before;
    },
    // One test runs one evaluation at a time, so there is nothing to wait for.
    lockEvaluation: () => Promise.resolve(),
    latestEvaluatedDate: async () => state.latestDate,
    usageOn: async (date): Promise<DayUsage> => {
      const day = state.usage[date];
      return day === undefined
        ? EMPTY_USAGE
        : {
            apps: new Map(Object.entries(day.apps)),
            categories: new Map(Object.entries(day.categories)),
          };
    },
    saveUsage: async (date, usage): Promise<void> => {
      state.usage[date] = {
        apps: Object.fromEntries(usage.apps),
        categories: Object.fromEntries(usage.categories),
      };
      if (state.latestDate === null || date > state.latestDate) {
        state.latestDate = date;
      }
    },
    recordBreaches: async (breaches): Promise<Breach[]> => {
      const fresh = breaches.filter(
        (breach) =>
          !state.events.includes(eventKey(breach)) &&
          state.goals.some((goal) => goal.id === breach.goal.id),
      );
      state.events.push(...fresh.map(eventKey));
      return fresh;
    },
  };
}

/** An in-memory store with the Postgres store's semantics, rolling back when `work` throws. */
export function createMemoryStore(initial: Partial<State> = {}): MemoryStore {
  let committed: State = { goals: [], usage: {}, latestDate: null, events: [], ...initial };
  return {
    state: () => committed,
    transaction: async <T>(work: (tx: GoalsTransaction) => Promise<T>): Promise<T> => {
      const draft = structuredClone(committed);
      const result = await work(bind(draft));
      committed = draft;
      return result;
    },
  };
}
