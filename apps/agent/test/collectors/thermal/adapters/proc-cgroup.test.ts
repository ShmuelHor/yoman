import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readContainerName } from '../../../../src/collectors/thermal/adapters/proc-cgroup.js';

// A low-entropy container ID, so no fixture looks like a token to gitleaks (ST02).
const ID = 'ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12';
const SHORT_ID = 'ab12ab12ab12';
const CONTAINER_PID = 4242;
const DESKTOP_PID = 7;
const EXITED_PID = 99;
const NOT_A_PID = 1.5;
const INVALID_PIDS = [0, -1, NOT_A_PID, Number.NaN];

describe('readContainerName', () => {
  let root: string;

  async function processWithCgroup(pid: number, cgroup: string): Promise<void> {
    await mkdir(join(root, String(pid)));
    await writeFile(join(root, String(pid), 'cgroup'), cgroup);
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yoman-cgroup-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('maps a containerized process to its container', async () => {
    // Arrange
    await processWithCgroup(CONTAINER_PID, `0::/system.slice/docker-${ID}.scope\n`);

    // Act / Assert
    expect(readContainerName(root, CONTAINER_PID)).toBe(`docker:${SHORT_ID}`);
  });

  it('maps a desktop process to no container', async () => {
    // Arrange
    await processWithCgroup(DESKTOP_PID, '0::/user.slice/user-1000.slice/session-2.scope\n');

    // Act / Assert
    expect(readContainerName(root, DESKTOP_PID)).toBeUndefined();
  });

  it('maps a process that has exited to no container', () => {
    // Act / Assert
    expect(readContainerName(root, EXITED_PID)).toBeUndefined();
  });

  it.each(INVALID_PIDS)('never reads a path built from pid %s', (pid) => {
    // Act / Assert
    expect(readContainerName(root, pid)).toBeUndefined();
  });
});
