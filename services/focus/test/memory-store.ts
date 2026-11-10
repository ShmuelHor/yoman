import { randomUUID } from 'node:crypto';
import type { AlertLevel, AlertType, QueuedAlert } from '@yoman/shared/alerts';
import type { KnownApp, Profile } from '@yoman/shared/focus';

import type { Schedule } from '../src/contracts.js';
import type { FocusSession } from '../src/domain/focus-session.js';
import type { FocusStore, FocusTransaction } from '../src/use-cases/store.js';

interface StoredSession extends FocusSession {
  readonly endedAtMs: number | null;
}

interface State {
  profiles: Profile[];
  sessions: StoredSession[];
  knownApps: KnownApp[];
  policy: [AlertType, AlertLevel][];
  accepted: [string, number][];
  queue: QueuedAlert[];
  schedules: Schedule[];
}

export interface MemoryStore extends FocusStore {
  /** The committed state, for assertions. */
  readonly state: () => State;
}

function bind(state: State): FocusTransaction {
  const removeById = <T extends { id: string }>(items: T[], id: string): [T[], boolean] => {
    const kept = items.filter((item) => item.id !== id);
    return [kept, kept.length < items.length];
  };
  return {
    // One caller at a time already: every transaction runs on its own draft.
    lock: async (): Promise<void> => undefined,
    openSession: async () => state.sessions.find((s) => s.endedAtMs === null) ?? null,
    startSession: async (session): Promise<FocusSession> => {
      const stored = { ...session, id: randomUUID(), mutedApps: [...session.mutedApps] };
      state.sessions.push({ ...stored, endedAtMs: null });
      return stored;
    },
    endSession: async (id, endedAtMs): Promise<void> => {
      state.sessions = state.sessions.map((s) => (s.id === id ? { ...s, endedAtMs } : s));
    },
    listProfiles: async (limit) => state.profiles.slice(0, limit),
    countProfiles: async () => state.profiles.length,
    getProfile: async (id) => state.profiles.find((p) => p.id === id) ?? null,
    defaultProfile: async () => state.profiles[0] ?? null,
    createProfile: async (input): Promise<Profile> => {
      const profile = { id: randomUUID(), ...input };
      state.profiles.push(profile);
      return profile;
    },
    updateProfile: async (id, input): Promise<Profile | null> => {
      if (!state.profiles.some((p) => p.id === id)) {
        return null;
      }
      const updated = { id, ...input };
      state.profiles = state.profiles.map((p) => (p.id === id ? updated : p));
      return updated;
    },
    deleteProfile: async (id): Promise<boolean> => {
      const [kept, removed] = removeById(state.profiles, id);
      state.profiles = kept;
      state.schedules = state.schedules.filter((s) => s.profileId !== id);
      return removed;
    },
    listKnownApps: async (limit) =>
      [...state.knownApps].sort((a, b) => a.appId.localeCompare(b.appId)).slice(0, limit),
    saveKnownApps: async (apps): Promise<number> => {
      let added = 0;
      for (const app of apps) {
        const existing = state.knownApps.find((known) => known.appId === app.appId);
        if (existing === undefined) {
          state.knownApps.push(app);
          added += 1;
          continue;
        }
        const refreshed = { ...app, name: app.name ?? existing.name };
        state.knownApps = state.knownApps.map((k) => (k.appId === app.appId ? refreshed : k));
      }
      return added;
    },
    alertPolicy: async () => new Map(state.policy),
    replaceAlertPolicy: async (entries): Promise<void> => {
      state.policy = entries.map((entry) => [entry.type, entry.level]);
    },
    lastAccepted: async (keys) => new Map(state.accepted.filter(([key]) => keys.includes(key))),
    recordAccepted: async (keys, atMs): Promise<void> => {
      state.accepted = [
        ...state.accepted.filter(([key]) => !keys.includes(key)),
        ...keys.map((key): [string, number] => [key, atMs]),
      ];
    },
    forgetAcceptedBefore: async (beforeMs): Promise<void> => {
      state.accepted = state.accepted.filter(([, atMs]) => atMs >= beforeMs);
    },
    enqueue: async (alerts, atMs, capacity): Promise<void> => {
      const queuedAt = new Date(atMs).toISOString();
      state.queue = [...state.queue, ...alerts.map((alert) => ({ alert, queuedAt }))].slice(
        -capacity,
      );
    },
    listQueue: async (limit) => state.queue.slice(0, limit),
    drainQueue: async (): Promise<QueuedAlert[]> => {
      const drained = state.queue;
      state.queue = [];
      return drained;
    },
    listSchedules: async (limit) => state.schedules.slice(0, limit),
    countSchedules: async () => state.schedules.length,
    createSchedule: async (input): Promise<Schedule> => {
      const schedule = { id: randomUUID(), ...input };
      state.schedules.push(schedule);
      return schedule;
    },
    updateSchedule: async (id, input): Promise<Schedule | null> => {
      if (!state.schedules.some((s) => s.id === id)) {
        return null;
      }
      const updated = { id, ...input };
      state.schedules = state.schedules.map((s) => (s.id === id ? updated : s));
      return updated;
    },
    deleteSchedule: async (id): Promise<boolean> => {
      const [kept, removed] = removeById(state.schedules, id);
      state.schedules = kept;
      return removed;
    },
  };
}

/** An in-memory store with the Postgres store's semantics, rolling back when `work` throws. */
export function createMemoryStore(initial: Partial<State> = {}): MemoryStore {
  let committed: State = {
    profiles: [],
    sessions: [],
    knownApps: [],
    policy: [],
    accepted: [],
    queue: [],
    schedules: [],
    ...initial,
  };
  return {
    state: () => committed,
    transaction: async <T>(work: (tx: FocusTransaction) => Promise<T>): Promise<T> => {
      const draft = structuredClone(committed);
      const result = await work(bind(draft));
      committed = draft;
      return result;
    },
  };
}
