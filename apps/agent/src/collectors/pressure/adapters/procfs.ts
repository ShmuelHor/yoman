import { closeSync, openSync, readdirSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { PRESSURE_RESOURCES, type PressureFiles } from '../domain/pressure.js';

/** Where the kernel exposes processes, pressure and memory. */
export const PROC_ROOT = '/proc';

/**
 * Every per-process file the collector opens. `cmdline` and `environ` are
 * deliberately absent: they can carry tokens and passwords (SECURITY A12).
 */
export const PROCESS_FILES = ['stat', 'io', 'status'] as const;
export type ProcessFile = (typeof PROCESS_FILES)[number];

/**
 * The largest file read: `/proc/<pid>/status` and `/proc/meminfo` are 1–2 kB.
 * Anything beyond is cut off, and a cut-off file fails to parse.
 */
export const MAX_PROC_FILE_BYTES = 8_192;

const PID_DIRECTORY = /^[1-9]\d{0,6}$/;

/**
 * `ENOENT`/`ESRCH`: the process exited mid-scan. `EACCES`: another user's
 * `io`. `EOPNOTSUPP`: PSI is compiled in but disabled (`psi=0`).
 */
const MISSING_CODES = new Set(['ENOENT', 'ESRCH', 'EACCES', 'EOPNOTSUPP']);

function errorCode(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

// One buffer for every read: the scan is synchronous, so reads never overlap.
const buffer = Buffer.alloc(MAX_PROC_FILE_BYTES);

/**
 * Reads a procfs file synchronously into a fixed buffer. A full process scan
 * opens about a thousand files; through the async API's thread pool that
 * costs about ten times the CPU (measured: ~90 ms against ~8 ms for 400
 * processes), which would break the battery budget (SPEC §4.4). procfs is
 * generated in memory, so the event loop is held for milliseconds at most.
 * Returns `undefined` for a file that is gone or not readable.
 */
export function readProcFile(path: string): string | undefined {
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch (error: unknown) {
    if (MISSING_CODES.has(String(errorCode(error)))) {
      return undefined;
    }
    throw error;
  }
  try {
    let length = 0;
    let read = 0;
    do {
      read = readSync(fd, buffer, length, MAX_PROC_FILE_BYTES - length, null);
      length += read;
    } while (read > 0 && length < MAX_PROC_FILE_BYTES);
    return buffer.toString('utf8', 0, length);
  } catch (error: unknown) {
    if (MISSING_CODES.has(String(errorCode(error)))) {
      return undefined;
    }
    throw error;
  } finally {
    closeSync(fd);
  }
}

/** The three `/proc/pressure` files; a kernel without PSI has none of them. */
export function readPressureFiles(root: string): PressureFiles {
  return Object.fromEntries(
    PRESSURE_RESOURCES.map((resource) => [
      resource,
      readProcFile(join(root, 'pressure', resource)),
    ]),
  );
}

export function readMeminfo(root: string): string | undefined {
  return readProcFile(join(root, 'meminfo'));
}

export function readUptime(root: string): string | undefined {
  return readProcFile(join(root, 'uptime'));
}

/** The pids of every running process, from the numeric directories in `/proc`. */
export function listPids(root: string): number[] {
  return readdirSync(root)
    .filter((name) => PID_DIRECTORY.test(name))
    .map(Number);
}

/** One per-process file; only the files in {@link PROCESS_FILES} can be named. */
export function readProcessFile(root: string, pid: number, file: ProcessFile): string | undefined {
  return readProcFile(join(root, String(pid), file));
}
