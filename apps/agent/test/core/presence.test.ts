import { describe, expect, it } from 'vitest';
import { createPresenceTracker } from '../../src/core/presence.js';
import type { Scheduler } from '../../src/core/scheduler.js';

const IDLE_MS = 42_000;

/** Records what the tracker asks of the scheduler, in order. */
function scheduler(): Pick<Scheduler, 'pause' | 'resume'> & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    pause: (): void => {
      calls.push('pause');
    },
    resume: (): void => {
      calls.push('resume');
    },
  };
}

describe('createPresenceTracker', () => {
  it('starts active and unlocked', () => {
    // Act
    const { presence } = createPresenceTracker(scheduler());

    // Assert
    expect({ ...presence }).toEqual({ idleMs: 0, locked: false });
  });

  it('keeps the values it was not given', () => {
    // Arrange
    const tracker = createPresenceTracker(scheduler());
    tracker.report({ locked: true });

    // Act
    tracker.report({ idleMs: IDLE_MS });

    // Assert
    expect({ ...tracker.presence }).toEqual({ idleMs: IDLE_MS, locked: true });
  });

  it('gives collectors a live view of the latest report', () => {
    // Arrange
    const tracker = createPresenceTracker(scheduler());
    const { presence } = tracker;

    // Act
    tracker.report({ idleMs: IDLE_MS });

    // Assert
    expect(presence.idleMs).toBe(IDLE_MS);
  });

  it('pauses the scheduler when the screen locks and resumes it on unlock', () => {
    // Arrange
    const polling = scheduler();
    const tracker = createPresenceTracker(polling);

    // Act
    tracker.report({ locked: true });
    tracker.report({ locked: false });

    // Assert
    expect(polling.calls).toEqual(['pause', 'resume']);
  });

  it('leaves the scheduler alone when the lock state does not change', () => {
    // Arrange
    const polling = scheduler();
    const tracker = createPresenceTracker(polling);

    // Act
    tracker.report({ locked: false });
    tracker.report({ idleMs: IDLE_MS });

    // Assert
    expect(polling.calls).toEqual([]);
  });
});
