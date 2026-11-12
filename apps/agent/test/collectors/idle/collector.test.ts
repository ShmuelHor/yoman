import { describe, expect, it } from 'vitest';
import { createIdleCollector, IDLE_INTERVAL_MS } from '../../../src/collectors/idle/collector.js';
import type { Collector, CollectorContext } from '../../../src/core/plugin.js';
import {
  type MethodCall,
  type SessionBus,
  SessionBusError,
} from '../../../src/core/session-bus.js';
import { type RecordedPresence, recordedPresence } from '../../support/collector-context.js';
import { recordingLogger } from '../../support/logs.js';

const IDLE_MS = 30_000;

type Reply = () => Promise<readonly unknown[]>;

function busReplying(...replies: Reply[]): SessionBus & { calls: MethodCall[] } {
  const calls: MethodCall[] = [];
  return {
    calls,
    call: (call): Promise<readonly unknown[]> => {
      calls.push(call);
      const next = replies.length > 1 ? replies.shift() : replies[0];
      return next === undefined ? Promise.resolve([]) : next();
    },
    subscribe: () => Promise.reject(new Error('the idle collector does not subscribe')),
    close: (): void => undefined,
  };
}

function idle(ms: number): Reply {
  return () => Promise.resolve([BigInt(ms)]);
}
const unavailable: Reply = () =>
  Promise.reject(new SessionBusError('CALL_FAILED', 'D-Bus call failed: ServiceUnknown'));
const malformed: Reply = () => Promise.resolve(['soon']);

function context(bus: SessionBus): CollectorContext & RecordedPresence & { logs: unknown[] } {
  const { logger, logs } = recordingLogger();
  return {
    logs,
    logger,
    sessionBus: bus,
    ...recordedPresence(),
    emit: (): Promise<void> => Promise.resolve(),
    reportKnownApps: (): void => undefined,
  };
}

async function collect(collector: Collector, ctx: CollectorContext): Promise<readonly unknown[]> {
  if (collector.collect === undefined) {
    throw new Error('the idle collector polls');
  }
  return collector.collect(ctx);
}

describe('idle collector', () => {
  it('polls every 5 seconds', () => {
    // Act / Assert
    expect(createIdleCollector()).toMatchObject({
      kind: 'collector',
      name: 'idle',
      intervalMs: IDLE_INTERVAL_MS,
    });
  });

  it("asks Mutter's core idle monitor", async () => {
    // Arrange
    const bus = busReplying(idle(IDLE_MS));

    // Act
    await collect(createIdleCollector(), context(bus));

    // Assert
    expect(bus.calls).toEqual([
      {
        destination: 'org.gnome.Mutter.IdleMonitor',
        path: '/org/gnome/Mutter/IdleMonitor/Core',
        interface: 'org.gnome.Mutter.IdleMonitor',
        member: 'GetIdletime',
      },
    ]);
  });

  it('reports the idle time as presence and buffers no samples', async () => {
    // Arrange
    const ctx = context(busReplying(idle(IDLE_MS)));

    // Act
    const samples = await collect(createIdleCollector(), ctx);

    // Assert
    expect(samples).toEqual([]);
    expect(ctx.reports).toEqual([{ idleMs: IDLE_MS }]);
  });

  it('warns once while Mutter is unavailable, without crashing', async () => {
    // Arrange
    const ctx = context(busReplying(unavailable));
    const collector = createIdleCollector();

    // Act
    await collect(collector, ctx);
    await collect(collector, ctx);

    // Assert
    expect(ctx.reports).toEqual([]);
    expect(ctx.logs).toEqual([
      expect.objectContaining({
        collector: 'idle',
        code: 'CALL_FAILED',
        msg: 'idle time is unavailable, is this GNOME?',
      }),
    ]);
  });

  it('warns again after Mutter came back and went away', async () => {
    // Arrange
    const replies = [unavailable, idle(IDLE_MS), unavailable];
    const ctx = context(busReplying(...replies));
    const collector = createIdleCollector();

    // Act
    for (const _reply of replies) {
      await collect(collector, ctx);
    }

    // Assert
    expect(ctx.reports).toEqual([{ idleMs: IDLE_MS }]);
    expect(ctx.logs).toHaveLength(2);
  });

  it('ignores a malformed reply and says so once', async () => {
    // Arrange
    const ctx = context(busReplying(malformed));
    const collector = createIdleCollector();

    // Act
    await collect(collector, ctx);
    await collect(collector, ctx);

    // Assert
    expect(ctx.reports).toEqual([]);
    expect(ctx.logs).toEqual([
      expect.objectContaining({ msg: 'idle monitor replied with an unexpected payload' }),
    ]);
  });

  it('lets an unexpected error reach the scheduler', async () => {
    // Arrange
    const bug = new TypeError('not a bus error');
    const ctx = context(busReplying(() => Promise.reject(bug)));

    // Act / Assert
    await expect(collect(createIdleCollector(), ctx)).rejects.toBe(bug);
  });
});
