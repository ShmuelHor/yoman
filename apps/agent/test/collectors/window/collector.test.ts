import { describe, expect, it } from 'vitest';
import {
  createWindowCollector,
  WINDOW_INTERVAL_MS,
} from '../../../src/collectors/window/collector.js';
import type { Collector, CollectorContext } from '../../../src/core/plugin.js';
import type { Presence } from '../../../src/core/presence.js';
import {
  type MethodCall,
  type SessionBus,
  SessionBusError,
} from '../../../src/core/session-bus.js';
import { recordedPresence } from '../../support/collector-context.js';
import { recordingLogger } from '../../support/logs.js';

const NOW = new Date('2026-11-10T09:30:00.000Z');
const IDLE_MS = 12_000;
const SECRET_TITLE = 'Bank statement - Mozilla Firefox';
const BROWSER = { wm_class: 'firefox', pid: 1717, focus: true, title: SECRET_TITLE };
const TERMINAL = { wm_class: 'gnome-terminal-server', pid: 4242, focus: false };

type Reply = () => Promise<readonly unknown[]>;

/** A fake session bus: each call takes the next reply, and the last one repeats. */
function busReplying(...replies: Reply[]): SessionBus & { calls: MethodCall[] } {
  const calls: MethodCall[] = [];
  return {
    calls,
    call: (call): Promise<readonly unknown[]> => {
      calls.push(call);
      const next = replies.length > 1 ? replies.shift() : replies[0];
      return next === undefined ? Promise.resolve([]) : next();
    },
    subscribe: () => Promise.reject(new Error('the window collector does not subscribe')),
    close: (): void => undefined,
  };
}

function windows(...list: unknown[]): Reply {
  return () => Promise.resolve([JSON.stringify(list)]);
}
const missingExtension: Reply = () =>
  Promise.reject(
    new SessionBusError(
      'CALL_FAILED',
      'D-Bus call failed: org.freedesktop.DBus.Error.UnknownObject',
    ),
  );
const malformed: Reply = () => Promise.resolve(['not json']);

function context(
  bus: SessionBus,
  presence: Partial<Presence> = {},
): CollectorContext & { logs: unknown[] } {
  const { logger, logs } = recordingLogger();
  return {
    logs,
    logger,
    sessionBus: bus,
    ...recordedPresence(presence),
    emit: (): Promise<void> => Promise.resolve(),
  };
}

async function collect(collector: Collector, ctx: CollectorContext): Promise<readonly unknown[]> {
  if (collector.collect === undefined) {
    throw new Error('the window collector polls');
  }
  return collector.collect(ctx);
}

function collector(): Collector {
  return createWindowCollector({ now: () => NOW });
}

describe('window collector', () => {
  it('polls every 5 seconds', () => {
    // Act / Assert
    expect(createWindowCollector()).toMatchObject({
      kind: 'collector',
      name: 'window',
      intervalMs: WINDOW_INTERVAL_MS,
    });
  });

  it('asks Window Calls for the window list', async () => {
    // Arrange
    const bus = busReplying(windows(BROWSER));

    // Act
    await collect(collector(), context(bus));

    // Assert
    expect(bus.calls).toEqual([
      {
        destination: 'org.gnome.Shell',
        path: '/org/gnome/Shell/Extensions/Windows',
        interface: 'org.gnome.Shell.Extensions.Windows',
        member: 'List',
      },
    ]);
  });

  it('samples the focused window with the latest idle time and lock state', async () => {
    // Arrange
    const ctx = context(busReplying(windows(TERMINAL, BROWSER)), { idleMs: IDLE_MS });

    // Act
    const samples = await collect(collector(), ctx);

    // Assert
    expect(samples).toEqual([
      {
        kind: 'window',
        ts: NOW.toISOString(),
        wmClass: 'firefox',
        pid: BROWSER.pid,
        idleMs: IDLE_MS,
        locked: false,
      },
    ]);
  });

  it('never sends the title, since no setting allows storing it yet', async () => {
    // Arrange
    const ctx = context(busReplying(windows(BROWSER)));

    // Act
    const samples = await collect(collector(), ctx);

    // Assert
    expect(samples).toHaveLength(1);
    expect(samples[0]).not.toHaveProperty('title');
    expect(JSON.stringify(samples)).not.toContain(SECRET_TITLE);
  });

  it('samples nothing when no window has focus', async () => {
    // Arrange
    const ctx = context(busReplying(windows(TERMINAL)));

    // Act
    const samples = await collect(collector(), ctx);

    // Assert
    expect(samples).toEqual([]);
    expect(ctx.logs).toEqual([]);
  });

  it('warns once while the extension is missing, without crashing', async () => {
    // Arrange
    const ctx = context(busReplying(missingExtension));
    const window = collector();

    // Act
    const first = await collect(window, ctx);
    const second = await collect(window, ctx);

    // Assert
    expect([...first, ...second]).toEqual([]);
    expect(ctx.logs).toEqual([
      expect.objectContaining({
        level: 40,
        collector: 'window',
        code: 'CALL_FAILED',
        msg: 'focused window is unavailable, is the Window Calls extension enabled?',
      }),
    ]);
  });

  it('picks the extension up once it is enabled, and warns again if it goes away', async () => {
    // Arrange
    const replies = [missingExtension, windows(BROWSER), missingExtension];
    const ctx = context(busReplying(...replies));
    const window = collector();

    // Act
    const samples: unknown[] = [];
    for (const _reply of replies) {
      samples.push(...(await collect(window, ctx)));
    }

    // Assert
    expect(samples).toHaveLength(1);
    expect(ctx.logs).toHaveLength(2);
  });

  it('drops a malformed reply and says so once, without its content', async () => {
    // Arrange
    const ctx = context(busReplying(malformed));
    const window = collector();

    // Act
    await collect(window, ctx);
    const samples = await collect(window, ctx);

    // Assert
    expect(samples).toEqual([]);
    expect(ctx.logs).toEqual([
      expect.objectContaining({ msg: 'Window Calls replied with an unexpected payload' }),
    ]);
    expect(JSON.stringify(ctx.logs)).not.toContain('not json');
  });

  it('never logs a title, even from a malformed reply', async () => {
    // Arrange
    const ctx = context(busReplying(windows({ ...BROWSER, pid: 'x' })));

    // Act
    await collect(collector(), ctx);

    // Assert
    expect(ctx.logs).toHaveLength(1);
    expect(JSON.stringify(ctx.logs)).not.toContain(SECRET_TITLE);
  });

  it('lets an unexpected error reach the scheduler', async () => {
    // Arrange
    const bug = new TypeError('not a bus error');
    const ctx = context(busReplying(() => Promise.reject(bug)));

    // Act / Assert
    await expect(collect(collector(), ctx)).rejects.toBe(bug);
  });
});
