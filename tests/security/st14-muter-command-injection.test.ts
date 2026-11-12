import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFile = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ execFile }));

import { createMuter } from '../../apps/agent/src/actuators/muter/actuator.js';
import { runFile } from '../../apps/agent/src/actuators/muter/adapters/gsettings.js';
import { createLogger } from '../../apps/agent/src/core/logger.js';
import type { SessionBus } from '../../apps/agent/src/core/session-bus.js';

import {
  SYSTEM_APP_IDS,
  USER_APP_IDS,
} from '../../packages/shared/src/fixtures/known-apps-catalog.js';

const INJECTIONS = ['slack;id', '$(id)', 'two words', '`id`', 'a|b', '../../etc'];

type ExecCallback = (error: Error | null, stdout: string) => void;

describe('ST14 muter command injection', () => {
  let stateDir: string;

  beforeEach(async () => {
    execFile.mockReset();
    execFile.mockImplementation(
      (_file: string, _args: string[], _opts: object, cb: ExecCallback) => {
        cb(null, 'true\n');
      },
    );
    stateDir = await mkdtemp(join(tmpdir(), 'yoman-st14-'));
  });

  afterEach(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  async function muteAll(ids: readonly string[]): Promise<void> {
    const muter = createMuter({ stateDir, run: runFile });
    const request = muter.input.parse({ mute: [], restore: [] });
    const context = {
      logger: createLogger({ level: 'silent', destination: { write: (): void => undefined } }),
      sessionBus: undefined as unknown as SessionBus,
    };
    // Bypasses the schema on purpose: the muter must also hold on its own.
    await muter.run({ ...request, mute: [...ids] }, context);
  }

  it('[T34] an app ID containing ;, $() or a space is rejected', async () => {
    const muter = createMuter({ stateDir, run: runFile });

    for (const id of INJECTIONS) {
      expect(muter.input.safeParse({ mute: [id], restore: [] }).success).toBe(false);
    }
    await muteAll(INJECTIONS);

    expect(execFile).not.toHaveBeenCalled();
  });

  it('[T34] execFile is called without a shell', async () => {
    await muteAll(['slack']);

    expect(execFile).toHaveBeenCalled();
    for (const [file, args, options] of execFile.mock.calls) {
      expect(file).toBe('gsettings');
      expect(Array.isArray(args)).toBe(true);
      expect(options).not.toHaveProperty('shell');
    }
  });

  it('[T34] a system app is never muted, in the dotted or the dashed ID form', async () => {
    const dotted = ['org.gnome.Settings', 'org.freedesktop.Tracker3', 'io.snapcraft.SessionAgent'];

    await muteAll([...SYSTEM_APP_IDS, ...dotted]);

    expect(execFile).not.toHaveBeenCalled();
  });

  it('[T34] an ordinary app from the same catalog is still muted', async () => {
    await muteAll([...SYSTEM_APP_IDS, USER_APP_IDS[0]]);

    const schemas = execFile.mock.calls.map(([, args]) => (args as string[])[1]);
    expect(schemas.length).toBeGreaterThan(0);
    for (const schema of schemas) {
      expect(schema).toContain(USER_APP_IDS[0]);
    }
  });
});
