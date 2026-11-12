import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sample } from '@yoman/shared/ingest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createLogger } from '../../src/core/logger.js';
import type { Actuator, Collector, CollectorContext } from '../../src/core/plugin.js';
import { createPresenceTracker, type PresenceTracker } from '../../src/core/presence.js';
import {
  loadRegistry,
  runActuator,
  scheduleCollectors,
  startPlugins,
  stopPlugins,
} from '../../src/core/registry.js';
import { createScheduler, type Scheduler } from '../../src/core/scheduler.js';
import { recordedPresence, unreachableSessionBus } from '../support/collector-context.js';

const INTERVAL_MS = 5_000;
/** Long enough for several ticks to come due. */
const LOCKED_FOR_MS = 15_000;
const SAMPLE: Sample = {
  kind: 'thermal',
  ts: '2026-11-08T09:00:00Z',
  cpuTempC: 50,
  throttled: false,
};

const POLLING = `export const plugin = {
  kind: 'collector', name: 'thermal', intervalMs: ${INTERVAL_MS},
  collect: async () => [],
};\n`;

function context(
  overrides: Partial<CollectorContext> = {},
): CollectorContext & { emitted: Sample[] } {
  const emitted: Sample[] = [];
  return {
    emitted,
    logger: createLogger({ level: 'silent' }),
    sessionBus: unreachableSessionBus(),
    ...recordedPresence(),
    reportKnownApps: (): void => undefined,
    emit: (samples): Promise<void> => {
      emitted.push(...samples);
      return Promise.resolve();
    },
    ...overrides,
  };
}

describe('loadRegistry', () => {
  let dir: string;

  async function addFolder(name: string, source?: string, file = 'index.js'): Promise<void> {
    await mkdir(join(dir, name));
    if (source !== undefined) {
      await writeFile(join(dir, name, file), source);
    }
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'yoman-registry-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('loads one plugin per folder, keyed by name', async () => {
    await addFolder('thermal', POLLING);
    await writeFile(join(dir, 'README.md'), 'ignored');
    const registry = await loadRegistry({ dir, kind: 'collector' });
    expect([...registry.keys()]).toEqual(['thermal']);
    expect(registry.get('thermal')?.intervalMs).toBe(INTERVAL_MS);
  });

  it('falls back to index.ts for development', async () => {
    await addFolder('thermal', POLLING, 'index.ts');
    const importModule = vi.fn(() => import(`data:text/javascript,${encodeURIComponent(POLLING)}`));
    await loadRegistry({ dir, kind: 'collector', importModule });
    expect(importModule).toHaveBeenCalledWith(expect.stringMatching(/thermal\/index\.ts$/));
  });

  it('returns an empty registry when the directory is missing', async () => {
    expect((await loadRegistry({ dir: join(dir, 'none'), kind: 'actuator' })).size).toBe(0);
  });

  it('surfaces other directory errors', async () => {
    await writeFile(join(dir, 'file'), '');
    await expect(loadRegistry({ dir: join(dir, 'file'), kind: 'actuator' })).rejects.toThrow();
  });

  it.each([
    ['a folder that is not kebab-case', 'Thermal', POLLING, 'kebab-case'],
    ['a folder without an entry', 'thermal', undefined, 'no index.js'],
    ['a module without a plugin export', 'thermal', 'export const x = 1;\n', 'invalid collector'],
    ['a name that differs from the folder', 'other', POLLING, 'does not match'],
    [
      'the wrong kind',
      'thermal',
      "export const plugin = { kind: 'actuator', name: 'thermal' };\n",
      'kind',
    ],
    [
      'an interval without collect',
      'thermal',
      "export const plugin = { kind: 'collector', name: 'thermal', intervalMs: 5 };\n",
      'go together',
    ],
    [
      'a collector that neither polls nor starts',
      'thermal',
      "export const plugin = { kind: 'collector', name: 'thermal' };\n",
      'polls or starts',
    ],
  ])('rejects %s', async (_case, folder, source, message) => {
    await addFolder(folder, source);
    await expect(loadRegistry({ dir, kind: 'collector' })).rejects.toThrow(message);
  });

  it('rejects an actuator whose input is not a zod schema', async () => {
    await addFolder(
      'notifier',
      "export const plugin = { kind: 'actuator', name: 'notifier', input: {}, run: () => {} };\n",
    );
    await expect(loadRegistry({ dir, kind: 'actuator' })).rejects.toThrow('input');
  });

  it('rejects a module that is not an object', async () => {
    await addFolder('thermal', 'export {};\n', 'index.ts');
    const importModule = (): Promise<unknown> => Promise.resolve(null);
    await expect(loadRegistry({ dir, kind: 'collector', importModule })).rejects.toThrow(
      'invalid collector',
    );
  });
});

describe('scheduleCollectors', () => {
  it('buffers each polling collector on its interval and skips event collectors', async () => {
    vi.useFakeTimers();
    try {
      const scheduler = createScheduler({ onError: vi.fn() });
      const polling: Collector = {
        kind: 'collector',
        name: 'thermal',
        intervalMs: INTERVAL_MS,
        collect: () => Promise.resolve([SAMPLE]),
      };
      const event: Collector = { kind: 'collector', name: 'lock', start: vi.fn() };
      const ctx = context();
      scheduleCollectors(
        scheduler,
        new Map([
          ['thermal', polling],
          ['lock', event],
        ]),
        ctx,
      );
      scheduler.start();
      await vi.advanceTimersByTimeAsync(INTERVAL_MS);
      scheduler.stop();
      expect(ctx.emitted).toEqual([SAMPLE, SAMPLE]);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('while the screen is locked', () => {
    let scheduler: Scheduler;
    let tracker: PresenceTracker;

    function schedule(collect: Collector['collect']): CollectorContext & { emitted: Sample[] } {
      const ctx = context({ presence: tracker.presence, reportPresence: tracker.report });
      const polling: Collector = {
        kind: 'collector',
        name: 'thermal',
        intervalMs: INTERVAL_MS,
        ...(collect === undefined ? {} : { collect }),
      };
      scheduleCollectors(scheduler, new Map([['thermal', polling]]), ctx);
      return ctx;
    }

    beforeEach(() => {
      vi.useFakeTimers();
      scheduler = createScheduler({ onError: vi.fn() });
      tracker = createPresenceTracker(scheduler);
    });

    afterEach(() => {
      scheduler.stop();
      vi.useRealTimers();
    });

    it('collects nothing until the screen is unlocked', async () => {
      // Arrange
      const collect = vi.fn(() => Promise.resolve([SAMPLE]));
      const ctx = schedule(collect);
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      // Act
      tracker.report({ locked: true });
      await vi.advanceTimersByTimeAsync(LOCKED_FOR_MS);
      const whileLocked = collect.mock.calls.length;
      tracker.report({ locked: false });
      await vi.advanceTimersByTimeAsync(0);

      // Assert
      expect(whileLocked).toBe(1);
      expect(ctx.emitted).toEqual([SAMPLE, SAMPLE]);
    });

    it('collects nothing when the screen locked before the scheduler started', async () => {
      // Arrange
      const collect = vi.fn(() => Promise.resolve([SAMPLE]));
      const ctx = schedule(collect);
      tracker.report({ locked: true });

      // Act
      scheduler.start();
      await vi.advanceTimersByTimeAsync(LOCKED_FOR_MS);

      // Assert
      expect(collect).not.toHaveBeenCalled();
      expect(ctx.emitted).toEqual([]);
      expect(scheduler.state).toBe('paused');
    });

    it('drops samples read while the screen was locking', async () => {
      // Arrange
      const ctx = schedule(() => {
        tracker.report({ locked: true });
        return Promise.resolve([SAMPLE]);
      });

      // Act
      scheduler.start();
      await vi.advanceTimersByTimeAsync(INTERVAL_MS);

      // Assert
      expect(ctx.emitted).toEqual([]);
    });
  });
});

describe('plugin lifecycle', () => {
  it('starts every plugin that has a start hook', async () => {
    const start = vi.fn(() => Promise.resolve());
    const ctx = context();
    await startPlugins(
      [
        { kind: 'collector', name: 'lock', start },
        { kind: 'collector', name: 'thermal', intervalMs: 1, collect: () => Promise.resolve([]) },
      ],
      ctx,
    );
    expect(start).toHaveBeenCalledWith(ctx);
  });

  it('stops every plugin even when one fails', async () => {
    const error = new Error('stuck');
    const stop = vi.fn(() => Promise.resolve());
    const onError = vi.fn();
    await stopPlugins(
      [
        { kind: 'collector', name: 'lock', start: vi.fn(), stop: () => Promise.reject(error) },
        { kind: 'collector', name: 'idle', start: vi.fn(), stop },
        { kind: 'collector', name: 'thermal', start: vi.fn() },
      ],
      onError,
    );
    expect(onError).toHaveBeenCalledWith('lock', error);
    expect(stop).toHaveBeenCalled();
  });
});

describe('runActuator', () => {
  const run = vi.fn(() => Promise.resolve());
  const notifier: Actuator<{ urgency: number }> = {
    kind: 'actuator',
    name: 'notifier',
    input: z.strictObject({ urgency: z.int().min(0).max(2), body: z.string().optional() }),
    run,
  };
  const actuators = new Map([['notifier', notifier as Actuator]]);
  const ctx = context();

  it('passes validated input to the actuator', async () => {
    await runActuator(actuators, 'notifier', { urgency: 2 }, ctx);
    expect(run).toHaveBeenCalledWith({ urgency: 2 }, ctx);
  });

  it('rejects invalid input by field, never by value', async () => {
    const secret = 'secret window title';
    const error: unknown = await runActuator(
      actuators,
      'notifier',
      { urgency: 9, body: 1, x: secret },
      ctx,
    ).catch((reason: unknown) => reason);
    expect((error as Error).message).toMatch(/^invalid input for notifier at: /);
    expect((error as Error).message).not.toContain(secret);
    await expect(runActuator(actuators, 'notifier', null, ctx)).rejects.toThrow('(root)');
  });

  it('rejects unknown actuators without echoing a malformed name', async () => {
    await expect(runActuator(actuators, 'muter', {}, ctx)).rejects.toThrow(
      'unknown actuator: muter',
    );
    await expect(runActuator(actuators, '<script>', {}, ctx)).rejects.toThrow('(invalid)');
  });
});
