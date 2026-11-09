import type { Scheduler } from './scheduler.js';

/** Whether someone is at the computer. Read by collectors, such as window for its samples. */
export interface Presence {
  readonly idleMs: number;
  readonly locked: boolean;
}

/** Reported by the idle and lock collectors only. */
export type PresenceUpdate = Partial<Presence>;

export interface PresenceTracker {
  /** A live view: it always reads the latest reported values. */
  readonly presence: Presence;
  report(update: PresenceUpdate): void;
}

/**
 * Tracks idle time and the screen lock, and pauses every polling collector
 * while the screen is locked (SPEC §4.1, §4.4). Unlocking resumes them, which
 * runs each one at once.
 */
export function createPresenceTracker(
  scheduler: Pick<Scheduler, 'pause' | 'resume'>,
): PresenceTracker {
  let idleMs = 0;
  let locked = false;

  return {
    presence: {
      get idleMs(): number {
        return idleMs;
      },
      get locked(): boolean {
        return locked;
      },
    },
    report(update): void {
      idleMs = update.idleMs ?? idleMs;
      const wasLocked = locked;
      locked = update.locked ?? locked;
      if (locked === wasLocked) {
        return;
      }
      if (locked) {
        scheduler.pause();
      } else {
        scheduler.resume();
      }
    },
  };
}
