import { LIMITS } from '@yoman/shared/limits';
import { z } from 'zod';

/** The counters of one process, from `/proc/<pid>/stat`. */
export interface ProcessStat {
  readonly pid: number;
  /** The kernel's short process name (at most 15 bytes), never the command line. */
  readonly comm: string;
  /** User plus system CPU time, in clock ticks. */
  readonly cpuTicks: number;
  /** When the process started, in clock ticks after boot; tells a reused pid apart. */
  readonly startTicks: number;
  /** Resident set size in pages: enough to rank, without knowing the page size. */
  readonly rssPages: number;
}

/** 15 digits stay inside `Number.MAX_SAFE_INTEGER`. */
const Counter = z
  .string()
  .regex(/^\d{1,15}$/)
  .transform(Number);

const Pid = Counter.pipe(z.number().int().min(1).max(LIMITS.pid));

/**
 * 1-based field numbers from proc(5), counted after the `(comm)` field, whose
 * text may itself contain spaces and parentheses.
 */
const FIRST_FIELD_AFTER_COMM = 3;
const STAT_FIELDS = { utime: 14, stime: 15, starttime: 22, rss: 24 } as const;

const StatFields = z.object({
  pid: Pid,
  comm: z.string().min(1).max(LIMITS.commLength),
  utime: Counter,
  stime: Counter,
  starttime: Counter,
  rss: Counter,
});

/** A process can rename itself to anything, so control characters are masked. */
const CONTROL_CHARACTERS = /\p{Cc}/gu;

function field(fields: readonly string[], number: number): string | undefined {
  return fields[number - FIRST_FIELD_AFTER_COMM];
}

/**
 * Parses `/proc/<pid>/stat`. `comm` sits between the first `(` and the last
 * `)`, because a process may put either character in its own name. Returns
 * `undefined` for a malformed or truncated file.
 */
export function parseProcessStat(text: string): ProcessStat | undefined {
  const open = text.indexOf(' (');
  const close = text.lastIndexOf(')');
  if (open < 0 || close < open) {
    return undefined;
  }
  const rest = text
    .slice(close + 1)
    .trim()
    .split(' ');
  const result = StatFields.safeParse({
    pid: text.slice(0, open),
    comm: text.slice(open + 2, close).replace(CONTROL_CHARACTERS, '?'),
    utime: field(rest, STAT_FIELDS.utime),
    stime: field(rest, STAT_FIELDS.stime),
    starttime: field(rest, STAT_FIELDS.starttime),
    rss: field(rest, STAT_FIELDS.rss),
  });
  if (!result.success) {
    return undefined;
  }
  const { pid, comm, utime, stime, starttime, rss } = result.data;
  return { pid, comm, cpuTicks: utime + stime, startTicks: starttime, rssPages: rss };
}

function namedValue(text: string, name: string): string | undefined {
  const prefix = `${name}:`;
  const line = text.split('\n').find((candidate) => candidate.startsWith(prefix));
  return line?.slice(prefix.length).trim();
}

/**
 * Bytes the process made the storage layer read and write, from
 * `/proc/<pid>/io`. Returns `undefined` for a malformed file.
 */
export function parseProcessIo(text: string): number | undefined {
  const read = Counter.safeParse(namedValue(text, 'read_bytes'));
  const written = Counter.safeParse(namedValue(text, 'write_bytes'));
  if (!read.success || !written.success) {
    return undefined;
  }
  return read.data + written.data;
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
