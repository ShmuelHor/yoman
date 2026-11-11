import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuter, MUTE_STATE_FILE } from '../../../src/actuators/muter/actuator.js';
import type { RunFile } from '../../../src/actuators/muter/adapters/gsettings.js';
import { modeOf } from '../../../src/core/private-fs.js';
import { recordingLogger } from '../../support/logs.js';

const START = new Date('2026-11-10T10:00:00.000Z');
const ENDS_AT = '2026-11-10T10:30:00.000Z';
const PRIVATE_FILE = 0o600;
const PRIVATE_DIR = 0o700;
const TWO = 2;
const MINUTE_MS = 60_000;
const HALF_HOUR_MINUTES = 30;
const HALF_HOUR_MS = HALF_HOUR_MINUTES * MINUTE_MS;

/** A fake gsettings that keeps values per schema path, like dconf does. */
function fakeGsettings(initial: Record<string, string> = {}): {
  run: RunFile;
  values: Map<string, string>;
  calls: string[][];
} {
  const values = new Map(Object.entries(initial));
  const calls: string[][] = [];
  const run: RunFile = async (_file, args) => {
    calls.push([...args]);
    const [verb, schema, , value] = args;
    if (schema === undefined) {
      throw new Error('missing schema');
    }
    if (verb === 'get') {
      return `${values.get(schema) ?? 'true'}\n`;
    }
    values.set(schema, value ?? '');
    return '';
  };
  return { run, values, calls };
}

function schema(appId: string): string {
  return `org.gnome.desktop.notifications.application:/org/gnome/desktop/notifications/application/${appId}/`;
}

describe('muter', () => {
  let stateDir: string;
  let clock: Date;

  beforeEach(async () => {
    vi.useFakeTimers({ now: START });
    clock = START;
    stateDir = await mkdtemp(join(tmpdir(), 'yoman-muter-'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(stateDir, { recursive: true, force: true });
  });

  function muter(run: RunFile): ReturnType<typeof createMuter> {
    return createMuter({ stateDir, run, now: () => clock });
  }

  const request = (over: object): Parameters<ReturnType<typeof createMuter>['run']>[0] =>
    ({ mute: [], restore: [], systemApps: [], ...over }) as never;

  it('mutes an app and saves its original value first, privately', async () => {
    const gs = fakeGsettings();
    const { logger } = recordingLogger();
    const subject = muter(gs.run);

    await subject.run(request({ mute: ['slack'], endsAt: ENDS_AT }), {
      logger,
      sessionBus: undefined as never,
    });

    expect(gs.values.get(schema('slack'))).toBe('false');
    const saved: unknown = JSON.parse(await readFile(join(stateDir, MUTE_STATE_FILE), 'utf8'));
    expect(saved).toEqual({ endsAt: ENDS_AT, originals: { slack: 'true' } });
    expect(await modeOf(join(stateDir, MUTE_STATE_FILE))).toBe(PRIVATE_FILE);
    expect(await modeOf(stateDir)).toBe(PRIVATE_DIR);
  });

  it('never runs gsettings for system apps or malformed ids', async () => {
    const gs = fakeGsettings();
    const { logger } = recordingLogger();

    await muter(gs.run).run(
      request({ mute: ['gnome-shell', 'update-manager', 'a;b', 'signal'], systemApps: ['signal'] }),
      { logger, sessionBus: undefined as never },
    );

    expect(gs.calls).toEqual([]);
  });

  it('restores the exact original value, including an app that was already muted', async () => {
    const gs = fakeGsettings({ [schema('slack')]: 'false' });
    const { logger } = recordingLogger();
    const ctx = { logger, sessionBus: undefined as never };
    const subject = muter(gs.run);
    await subject.run(request({ mute: ['slack', 'discord'] }), ctx);

    await subject.run(request({ restore: ['slack', 'discord'] }), ctx);

    expect(gs.values.get(schema('slack'))).toBe('false');
    expect(gs.values.get(schema('discord'))).toBe('true');
  });

  it('logs each mute and restore with the app id only', async () => {
    const gs = fakeGsettings();
    const { logger, logs } = recordingLogger();
    const ctx = { logger, sessionBus: undefined as never };
    const subject = muter(gs.run);

    await subject.run(request({ mute: ['slack'] }), ctx);
    await subject.run(request({ restore: ['slack'] }), ctx);

    expect(logs).toEqual([
      expect.objectContaining({ msg: 'app muted', actuator: 'muter', appId: 'slack' }),
      expect.objectContaining({ msg: 'app restored', actuator: 'muter', appId: 'slack' }),
    ]);
  });

  it('restores everything on startup after a crash mid-focus', async () => {
    const gs = fakeGsettings();
    const { logger } = recordingLogger();
    const ctx = { logger, sessionBus: undefined as never };
    await muter(gs.run).run(request({ mute: ['slack'], endsAt: ENDS_AT }), ctx);
    expect(gs.values.get(schema('slack'))).toBe('false');

    // The first muter is abandoned without stop(), as after kill -9.
    const next = muter(gs.run);
    await next.start?.(ctx);

    expect(gs.values.get(schema('slack'))).toBe('true');
    const saved: unknown = JSON.parse(await readFile(join(stateDir, MUTE_STATE_FILE), 'utf8'));
    expect(saved).toEqual({ endsAt: null, originals: {} });
  });

  it('restores by itself when focus.endsAt passes', async () => {
    const gs = fakeGsettings();
    const { logger } = recordingLogger();
    await muter(gs.run).run(request({ mute: ['slack'], endsAt: ENDS_AT }), {
      logger,
      sessionBus: undefined as never,
    });

    clock = new Date(START.getTime() + HALF_HOUR_MS + 1);
    await vi.advanceTimersByTimeAsync(HALF_HOUR_MS + 1);

    expect(gs.values.get(schema('slack'))).toBe('true');
  });

  it('refuses to mute with a focus that already ended', async () => {
    const gs = fakeGsettings();
    const { logger } = recordingLogger();
    clock = new Date(START.getTime() + TWO * HALF_HOUR_MS);

    await muter(gs.run).run(request({ mute: ['slack'], endsAt: ENDS_AT }), {
      logger,
      sessionBus: undefined as never,
    });

    expect(gs.values.get(schema('slack'))).toBeUndefined();
  });

  it('keeps an app in the state when its restore fails, and retries on the next start', async () => {
    const gs = fakeGsettings();
    const { logger } = recordingLogger();
    const ctx = { logger, sessionBus: undefined as never };
    await muter(gs.run).run(request({ mute: ['slack'] }), ctx);
    const failing: RunFile = () => Promise.reject(new Error('dconf down'));

    await muter(failing).start?.(ctx);
    expect(gs.values.get(schema('slack'))).toBe('false');
    await muter(gs.run).start?.(ctx);

    expect(gs.values.get(schema('slack'))).toBe('true');
  });

  it('restores on a clean stop', async () => {
    const gs = fakeGsettings();
    const { logger } = recordingLogger();
    const subject = muter(gs.run);
    await subject.start?.({ logger, sessionBus: undefined as never });
    await subject.run(request({ mute: ['slack'] }), { logger, sessionBus: undefined as never });

    await subject.stop?.();

    expect(gs.values.get(schema('slack'))).toBe('true');
  });

  it('treats a corrupt state file as empty and says so', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(stateDir, MUTE_STATE_FILE), '{not json');
    const { logger, logs } = recordingLogger();

    await muter(fakeGsettings().run).start?.({ logger, sessionBus: undefined as never });

    expect(JSON.stringify(logs)).toContain('unreadable');
  });
});
