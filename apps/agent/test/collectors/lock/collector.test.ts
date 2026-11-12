import type { Sample } from '@yoman/shared/ingest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLockCollector } from '../../../src/collectors/lock/collector.js';
import type { Collector, CollectorContext } from '../../../src/core/plugin.js';
import { createPresenceTracker } from '../../../src/core/presence.js';
import { scheduleCollectors } from '../../../src/core/registry.js';
import { createScheduler, type Scheduler } from '../../../src/core/scheduler.js';
import {
  type MethodCall,
  type SessionBus,
  SessionBusError,
  type SignalHandler,
  type SignalMatch,
} from '../../../src/core/session-bus.js';
import { recordedPresence } from '../../support/collector-context.js';
import { recordingLogger } from '../../support/logs.js';

const IDLE_MS = 300_000;
const INTERVAL_MS = 5_000;
const AN_HOUR_MS = 3_600_000;
const SAMPLE: Sample = {
  kind: 'thermal',
  ts: '2026-11-09T08:00:00.000Z',
  cpuTempC: 50,
  throttled: false,
};

/** A bus with GNOME's screen saver: `GetActive` answers `active`, `signal` fires `ActiveChanged`. */
class FakeScreenSaver implements SessionBus {
  readonly calls: MethodCall[] = [];
  readonly subscriptions: SignalMatch[] = [];
  unsubscribed = false;
  private handler: SignalHandler | undefined;

  constructor(private readonly active: () => Promise<readonly unknown[]>) {}

  call(call: MethodCall): Promise<readonly unknown[]> {
    this.calls.push(call);
    return this.active();
  }

  subscribe(match: SignalMatch, handler: SignalHandler): Promise<() => Promise<void>> {
    this.subscriptions.push(match);
    this.handler = handler;
    return Promise.resolve(() => {
      this.unsubscribed = true;
      return Promise.resolve();
    });
  }

  close(): void {
    this.unsubscribed = true;
  }

  signal(body: readonly unknown[]): void {
    this.handler?.(body);
  }
}

function screenSaver(active: boolean): FakeScreenSaver {
  return new FakeScreenSaver(() => Promise.resolve([active]));
}

function context(
  bus: SessionBus,
  presence: Pick<CollectorContext, 'presence' | 'reportPresence'> = recordedPresence(),
): CollectorContext & { logs: unknown[] } {
  const { logger, logs } = recordingLogger();
  return {
    logs,
    logger,
    sessionBus: bus,
    ...presence,
    emit: (): Promise<void> => Promise.resolve(),
    reportKnownApps: (): void => undefined,
  };
}

async function start(collector: Collector, ctx: CollectorContext): Promise<void> {
  if (collector.start === undefined) {
    throw new Error('the lock collector is event-driven');
  }
  await collector.start(ctx);
}

describe('lock collector', () => {
  it('subscribes to ActiveChanged from GNOME Shell only', async () => {
    // Arrange
    const bus = screenSaver(false);

    // Act
    await start(createLockCollector(), context(bus));

    // Assert
    expect(bus.subscriptions).toEqual([
      {
        sender: 'org.gnome.ScreenSaver',
        path: '/org/gnome/ScreenSaver',
        interface: 'org.gnome.ScreenSaver',
        member: 'ActiveChanged',
      },
    ]);
  });

  it('reports a screen that is already locked at start', async () => {
    // Arrange
    const presence = recordedPresence();

    // Act
    await start(createLockCollector(), context(screenSaver(true), presence));

    // Assert
    expect(presence.reports).toEqual([{ locked: true }]);
  });

  it('reports each lock and unlock, and resets idle time on unlock', async () => {
    // Arrange
    const saver = screenSaver(false);
    const presence = recordedPresence({ idleMs: IDLE_MS });
    await start(createLockCollector(), context(saver, presence));

    // Act
    saver.signal([true]);
    saver.signal([false]);

    // Assert
    expect(presence.reports).toEqual([
      { locked: false, idleMs: 0 },
      { locked: true },
      { locked: false, idleMs: 0 },
    ]);
  });

  it('ignores a malformed signal and warns', async () => {
    // Arrange
    const saver = screenSaver(false);
    const presence = recordedPresence();
    const ctx = context(saver, presence);
    await start(createLockCollector(), ctx);

    // Act
    saver.signal(['locked']);

    // Assert
    expect(presence.reports).toEqual([{ locked: false, idleMs: 0 }]);
    expect(ctx.logs).toEqual([
      expect.objectContaining({
        collector: 'lock',
        msg: 'screen saver sent an unexpected payload, ignored',
      }),
    ]);
  });

  it('warns without crashing when there is no session bus', async () => {
    // Arrange
    const unreachable: SessionBus = {
      call: () => Promise.reject(new SessionBusError('UNAVAILABLE', 'no bus')),
      subscribe: () => Promise.reject(new SessionBusError('UNAVAILABLE', 'no bus')),
      close: (): void => undefined,
    };
    const ctx = context(unreachable);

    // Act
    await start(createLockCollector(), ctx);

    // Assert
    expect(ctx.logs).toEqual([
      expect.objectContaining({
        collector: 'lock',
        code: 'UNAVAILABLE',
        msg: 'screen lock is not tracked, is this GNOME?',
      }),
    ]);
  });

  it('keeps listening when GNOME Shell does not answer yet', async () => {
    // Arrange
    const saver = new FakeScreenSaver(() =>
      Promise.reject(new SessionBusError('CALL_FAILED', 'D-Bus call failed: ServiceUnknown')),
    );
    const presence = recordedPresence();
    await start(createLockCollector(), context(saver, presence));

    // Act
    saver.signal([true]);

    // Assert
    expect(presence.reports).toEqual([{ locked: true }]);
  });

  it('lets an unexpected error fail the start', async () => {
    // Arrange
    const bug = new TypeError('not a bus error');
    const saver = new FakeScreenSaver(() => Promise.reject(bug));

    // Act / Assert
    await expect(start(createLockCollector(), context(saver))).rejects.toBe(bug);
  });

  it('unsubscribes on stop', async () => {
    // Arrange
    const saver = screenSaver(false);
    const collector = createLockCollector();
    await start(collector, context(saver));

    // Act
    await collector.stop?.();

    // Assert
    expect(saver.unsubscribed).toBe(true);
  });

  describe('with the scheduler', () => {
    let scheduler: Scheduler;

    beforeEach(() => {
      vi.useFakeTimers();
      scheduler = createScheduler({ onError: vi.fn() });
    });

    afterEach(() => {
      scheduler.stop();
      vi.useRealTimers();
    });

    it('produces no samples while the screen is locked', async () => {
      // Arrange
      const tracker = createPresenceTracker(scheduler);
      const saver = screenSaver(false);
      const emitted: Sample[] = [];
      const ctx: CollectorContext = {
        ...context(saver, { presence: tracker.presence, reportPresence: tracker.report }),
        emit: (samples): Promise<void> => {
          emitted.push(...samples);
          return Promise.resolve();
        },
      };
      const polling: Collector = {
        kind: 'collector',
        name: 'thermal',
        intervalMs: INTERVAL_MS,
        collect: () => Promise.resolve([SAMPLE]),
      };
      scheduleCollectors(scheduler, new Map([['thermal', polling]]), ctx);
      await start(createLockCollector(), ctx);
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);
      const beforeLock = emitted.length;

      // Act
      saver.signal([true]);
      await vi.advanceTimersByTimeAsync(AN_HOUR_MS);
      const whileLocked = emitted.length - beforeLock;
      saver.signal([false]);
      await vi.advanceTimersByTimeAsync(0);

      // Assert
      expect(beforeLock).toBe(1);
      expect(whileLocked).toBe(0);
      expect(emitted).toHaveLength(2);
    });
  });
});
