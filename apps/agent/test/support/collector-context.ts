import type { Presence, PresenceUpdate } from '../../src/core/presence.js';
import { type SessionBus, SessionBusError } from '../../src/core/session-bus.js';

/** A session bus that is never reachable, for plugins that do not use one. */
export function unreachableSessionBus(): SessionBus {
  const unavailable = (): Promise<never> =>
    Promise.reject(new SessionBusError('UNAVAILABLE', 'no session bus in tests'));
  return { call: unavailable, subscribe: unavailable, close: (): void => undefined };
}

export interface RecordedPresence {
  readonly presence: Presence;
  readonly reportPresence: (update: PresenceUpdate) => void;
  /** Every update, in order. */
  readonly reports: PresenceUpdate[];
}

/** Presence that records reports without a scheduler behind it. */
export function recordedPresence(initial: Partial<Presence> = {}): RecordedPresence {
  const current = { idleMs: 0, locked: false, ...initial };
  const reports: PresenceUpdate[] = [];
  return {
    presence: current,
    reports,
    reportPresence: (update): void => {
      reports.push(update);
      Object.assign(current, update);
    },
  };
}
