import { LIMITS } from '@yoman/shared/limits';
import { z } from 'zod';

/** The counters of one process, from `/proc/<pid>/stat`. */
export interface ProcessStat {
  readonly pid: number;
  /** The kernel's short process name (at most 15 bytes), never the command line. */
  readonly comm: string;
  readonly kernelThread: boolean;
  /** User plus system CPU time, in clock ticks. */
  readonly cpuTicks: number;
  /** When the process started, in clock ticks after boot; tells a reused pid apart. */
  readonly startTicks: number;
  /** Resident set size in pages: enough to rank, without knowing the page size. */
  readonly rssPages: number;
}

/** 15 digits stay inside `Number.MAX_SAFE_INTEGER`, so `Number` is exact. */
const Counter = z.int().min(0).max(Number.MAX_SAFE_INTEGER);
const UINT32_MAX = 0xffff_ffff;

const StatFields = z.object({
  pid: z.int().min(1).max(LIMITS.pid),
  comm: z.string().min(1).max(LIMITS.commLength),
  flags: z.int().min(0).max(UINT32_MAX),
  utime: Counter,
  stime: Counter,
  starttime: Counter,
  rss: Counter,
});

/**
 * pid, `(comm)`, then fields 3 to 24 of proc(5): six skipped, `flags` (9),
 * four skipped, `utime` (14) and `stime` (15), six skipped, `starttime` (22),
 * one skipped, `rss` (24). The comm group is greedy, so a name holding `) `
 * still ends at the last match. One regex instead of a split per process
 * keeps a full scan cheap (SPEC §4.4).
 */
const STAT_LINE =
  /^(\d{1,7}) \((.*)\) (?:\S+ ){6}(\d{1,10}) (?:\S+ ){4}(\d{1,15}) (\d{1,15}) (?:\S+ ){6}(\d{1,15}) \S+ (\d{1,15})(?: |$)/s;

/** `PF_KTHREAD` in `flags`: a kernel thread owns no user memory and no readable IO counters. */
const PF_KTHREAD = 0x0020_0000;

/** A process can rename itself to anything, so control characters are masked. */
const CONTROL_CHARACTERS = /\p{Cc}/gu;

/**
 * Parses `/proc/<pid>/stat`. Returns `undefined` for a malformed or
 * truncated file.
 */
export function parseProcessStat(text: string): ProcessStat | undefined {
  const match = STAT_LINE.exec(text);
  if (match === null) {
    return undefined;
  }
  const [, pid, comm = '', flags, utime, stime, starttime, rss] = match;
  const result = StatFields.safeParse({
    pid: Number(pid),
    comm: comm.replace(CONTROL_CHARACTERS, '?'),
    flags: Number(flags),
    utime: Number(utime),
    stime: Number(stime),
    starttime: Number(starttime),
    rss: Number(rss),
  });
  if (!result.success) {
    return undefined;
  }
  const data = result.data;
  return {
    pid: data.pid,
    comm: data.comm,
    kernelThread: (data.flags & PF_KTHREAD) !== 0,
    cpuTicks: data.utime + data.stime,
    startTicks: data.starttime,
    rssPages: data.rss,
  };
}

const ProcessIo = z.object({ read: Counter, written: Counter });
const READ_BYTES = /^read_bytes: (\d{1,15})$/m;
const WRITE_BYTES = /^write_bytes: (\d{1,15})$/m;

/**
 * Bytes the process made the storage layer read and write, from
 * `/proc/<pid>/io`. Returns `undefined` for a malformed file.
 */
export function parseProcessIo(text: string): number | undefined {
  const read = READ_BYTES.exec(text)?.[1];
  const written = WRITE_BYTES.exec(text)?.[1];
  const result = ProcessIo.safeParse({ read: Number(read), written: Number(written) });
  return result.success ? result.data.read + result.data.written : undefined;
}

function namedValue(text: string, name: string): string | undefined {
  const prefix = `${name}:`;
  const line = text.split('\n').find((candidate) => candidate.startsWith(prefix));
  return line?.slice(prefix.length).trim();
}

const KILOBYTE = 1_024;
const VmRss = z
  .string()
  .regex(/^\d{1,12} kB$/)
  .transform((value) => Number.parseInt(value, 10) * KILOBYTE);

/**
 * Resident memory in bytes, from the `VmRSS` line of `/proc/<pid>/status`.
 * Kernel threads have no such line and own no user memory, so they read as 0.
 * Returns `undefined` for a malformed value.
 */
export function parseResidentBytes(text: string): number | undefined {
  const value = namedValue(text, 'VmRSS');
  if (value === undefined) {
    return 0;
  }
  const result = VmRss.safeParse(value);
  return result.success ? result.data : undefined;
}

const Uptime = z
  .string()
  .regex(/^\d{1,12}\.\d{2}$/)
  .transform(Number);

/** Seconds since boot, the first value in `/proc/uptime`; `undefined` when malformed. */
export function parseUptime(text: string): number | undefined {
  const result = Uptime.safeParse(text.trim().split(' ')[0]);
  return result.success ? result.data : undefined;
}
