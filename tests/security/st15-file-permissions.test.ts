import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBuffer } from '../../apps/agent/src/core/buffer.js';
import { resolveAgentPaths } from '../../apps/agent/src/core/paths.js';
import { modeOf } from '../../apps/agent/src/core/private-fs.js';

const PRIVATE_DIR = 0o700;
const PRIVATE_FILE = 0o600;
const WORLD_READABLE_DIR = 0o755;
const WORLD_READABLE_FILE = 0o644;
const PERMISSIVE_UMASK = 0o000;

describe('ST15 file permissions', () => {
  it.todo('[T02] npm run setup creates .env with mode 0600');

  it('[T12] agent state files are 0600 in a 0700 directory', async () => {
    const home = await mkdtemp(join(tmpdir(), 'yoman-st15-'));
    // A permissive umask must not loosen anything the agent creates.
    const previousUmask = process.umask(PERMISSIVE_UMASK);
    try {
      const paths = resolveAgentPaths({ HOME: home });
      // A buffer file left world-readable by an older run is tightened on startup.
      await mkdir(paths.bufferDir, { recursive: true, mode: WORLD_READABLE_DIR });
      await writeFile(join(paths.bufferDir, '2026-11-08T08.jsonl'), '', {
        mode: WORLD_READABLE_FILE,
      });

      const buffer = await createBuffer({ ...paths, logger: { warn: (): void => undefined } });
      await buffer.append([
        {
          kind: 'window',
          ts: new Date().toISOString(),
          wmClass: 'firefox',
          pid: 1,
          idleMs: 0,
          locked: false,
        },
      ]);

      expect(await modeOf(paths.stateDir)).toBe(PRIVATE_DIR);
      expect(await modeOf(paths.bufferDir)).toBe(PRIVATE_DIR);
      const files = await readdir(paths.bufferDir);
      expect(files.length).toBeGreaterThan(1);
      for (const file of files) {
        expect(await modeOf(join(paths.bufferDir, file))).toBe(PRIVATE_FILE);
      }
    } finally {
      process.umask(previousUmask);
      await rm(home, { recursive: true, force: true });
    }
  });

  it.todo('[T48] backups are 0600 in a 0700 directory');
});
