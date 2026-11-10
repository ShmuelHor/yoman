import { join } from 'node:path';
import { Pid } from '@yoman/shared/common';
import { readProcFile } from '../../pressure/adapters/procfs.js';
import { parseContainerName } from '../domain/container-name.js';

/**
 * The container a process runs in, from `/proc/<pid>/cgroup` under `root`
 * (SPEC §4.1 processes). This is the whole mapping: the agent never opens a
 * runtime socket and never needs the `docker` group (SECURITY A15). The read
 * is bounded like every other procfs read. Returns `undefined` for a process
 * outside any container, one that has exited, and an invalid pid.
 */
export function readContainerName(root: string, pid: number): string | undefined {
  if (!Pid.safeParse(pid).success) {
    return undefined;
  }
  const text = readProcFile(join(root, String(pid), 'cgroup'));
  return text === undefined ? undefined : parseContainerName(text);
}
