import { randomUUID } from 'node:crypto';
import type { App, Rule, Session } from '@yoman/shared/sessions';

import type { Span } from '../src/domain/merge-samples.js';
import type {
  CategorizedSpan,
  SessionsStore,
  SessionsTransaction,
  StoredSpan,
} from '../src/use-cases/store.js';

interface State {
  apps: App[];
  rules: Rule[];
  sessions: StoredSpan[];
  recordedUntil: number | null;
}

export interface MemoryStore extends SessionsStore {
  /** The committed state, for assertions. */
  readonly state: () => State;
}

function toSession(span: StoredSpan): Session {
  return {
    id: span.id,
    appId: span.appId,
    start: new Date(span.startMs).toISOString(),
    end: new Date(span.endMs).toISOString(),
    ...(span.title === null ? {} : { title: span.title }),
  };
}

function bind(state: State): SessionsTransaction {
  const save = (span: CategorizedSpan): StoredSpan => {
    const stored = { ...span, id: span.id ?? randomUUID() };
    state.sessions = [...state.sessions.filter((s) => s.id !== stored.id), stored];
    return stored;
  };
  return {
    lockOpenSession: async (): Promise<Span | null> => {
      const open = state.sessions.find((s) => !s.closed);
      return open === undefined ? null : { ...open };
    },
    recordedUntil: async () => state.recordedUntil,
    setRecordedUntil: async (tsMs): Promise<void> => {
      state.recordedUntil = tsMs;
    },
    saveSpans: async (spans) => spans.map(save),
    listSessions: async (range, limit) =>
      state.sessions
        .filter((s) => s.startMs < Date.parse(range.to) && s.endMs >= Date.parse(range.from))
        .sort((a, b) => a.startMs - b.startMs)
        .slice(0, limit)
        .map(toSession),
    sessionsEndingSince: async (cutoff) =>
      state.sessions
        .filter((s) => s.endMs >= cutoff.getTime())
        .map((s) => ({ id: s.id, wmClass: s.appId, title: s.title, category: s.category })),
    setCategories: async (changes): Promise<void> => {
      for (const change of changes) {
        state.sessions = state.sessions.map((s) =>
          s.id === change.id ? { ...s, category: change.category } : s,
        );
      }
    },
    ensureApps: async (ids): Promise<void> => {
      for (const id of ids) {
        if (!state.apps.some((app) => app.id === id)) {
          state.apps.push({ id, name: id, icon: null, category: null });
        }
      }
    },
    appCategories: async () =>
      new Map(state.apps.filter((app) => app.category !== null).map((a) => [a.id, a.category])),
    listApps: async (limit) => state.apps.slice(0, limit),
    updateApp: async (id, update): Promise<App | null> => {
      const app = state.apps.find((a) => a.id === id);
      if (app === undefined) {
        return null;
      }
      const updated = { ...app, ...update };
      state.apps = state.apps.map((a) => (a.id === id ? updated : a));
      return updated;
    },
    listRules: async (limit) => state.rules.slice(0, limit),
    countRules: async () => state.rules.length,
    createRule: async (input): Promise<Rule> => {
      const rule = { id: randomUUID(), ...input };
      state.rules.push(rule);
      return rule;
    },
    updateRule: async (id, input): Promise<Rule | null> => {
      if (!state.rules.some((rule) => rule.id === id)) {
        return null;
      }
      const updated = { id, ...input };
      state.rules = state.rules.map((rule) => (rule.id === id ? updated : rule));
      return updated;
    },
    deleteRule: async (id): Promise<boolean> => {
      const before = state.rules.length;
      state.rules = state.rules.filter((rule) => rule.id !== id);
      return state.rules.length < before;
    },
  };
}

/** An in-memory store with the Postgres store's semantics, rolling back when `work` throws. */
export function createMemoryStore(initial: Partial<State> = {}): MemoryStore {
  let committed: State = { apps: [], rules: [], sessions: [], recordedUntil: null, ...initial };
  return {
    state: () => committed,
    transaction: async <T>(work: (tx: SessionsTransaction) => Promise<T>): Promise<T> => {
      const draft = structuredClone(committed);
      const result = await work(bind(draft));
      committed = draft;
      return result;
    },
  };
}
