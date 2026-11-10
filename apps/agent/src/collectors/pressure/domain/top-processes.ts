import { LIMITS } from '@yoman/shared/limits';
import type { ProcessStat } from './process-files.js';

/** One process at one moment: its stat counters plus its storage IO so far. */
export interface ProcessCounters extends ProcessStat {
  /** 0 when `/proc/<pid>/io` is not readable, which it is not for other users' processes. */
  readonly ioBytes: number;
}

/** Every process at one moment, kept so the next scan can measure rates. */
export interface ProcessScan {
  readonly uptimeSec: number;
  readonly counters: ReadonlyMap<number, ProcessCounters>;
}

/** What a process used between two scans, or over its lifetime on first sight. */
export interface ProcessUsage {
  readonly pid: number;
  readonly comm: string;
  /** Summed over cores, so a busy multithreaded process exceeds 100. */
  readonly cpuPct: number;
  readonly rssPages: number;
  readonly ioBytesPerSec: number;
}

/**
 * `USER_HZ`: the unit of `/proc` CPU times. It is part of the kernel's ABI
 * and 100 on every Linux architecture, whatever the kernel's internal HZ.
 */
export const CLOCK_TICKS_PER_SECOND = 100;

const PERCENT = 100;
/** Two decimals: finer than anyone reads a process list. */
const PRECISION = 100;

function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

interface Window {
  readonly cpuTicks: number;
  readonly ioBytes: number;
  readonly seconds: number;
}

/**
 * The counters to subtract and the time they cover: the previous scan when it
 * saw the same process (same pid and start time), otherwise its whole life.
 */
function windowFor(process: ProcessCounters, uptimeSec: number, previous?: ProcessScan): Window {
  const before = previous?.counters.get(process.pid);
  if (previous !== undefined && before?.startTicks === process.startTicks) {
    return {
      cpuTicks: before.cpuTicks,
      ioBytes: before.ioBytes,
      seconds: uptimeSec - previous.uptimeSec,
    };
  }
  return {
    cpuTicks: 0,
    ioBytes: 0,
    seconds: uptimeSec - process.startTicks / CLOCK_TICKS_PER_SECOND,
  };
}

/**
 * How much CPU and IO each process used since `previous`. A process the
 * previous scan did not see is measured over its lifetime instead, so a
 * newcomer still ranks. Rates are clamped to the contract's limits.
 */
export function measureUsage(scan: ProcessScan, previous?: ProcessScan): ProcessUsage[] {
  return [...scan.counters.values()].map((process) => {
    const window = windowFor(process, scan.uptimeSec, previous);
    const seconds = Math.max(window.seconds, 0);
    const cpuSeconds = Math.max(process.cpuTicks - window.cpuTicks, 0) / CLOCK_TICKS_PER_SECOND;
    const ioBytes = Math.max(process.ioBytes - window.ioBytes, 0);
    return {
      pid: process.pid,
      comm: process.comm,
      cpuPct:
        seconds > 0 ? Math.min(round((cpuSeconds / seconds) * PERCENT), LIMITS.processCpuPct) : 0,
      rssPages: process.rssPages,
      ioBytesPerSec: seconds > 0 ? Math.round(ioBytes / seconds) : 0,
    };
  });
}

type Metric = 'cpuPct' | 'rssPages' | 'ioBytesPerSec';
const METRICS: readonly Metric[] = ['cpuPct', 'rssPages', 'ioBytesPerSec'];

/**
 * The heaviest processes (SPEC §4.1): the top `count` by CPU, by memory and
 * by IO, merged without duplicates and ordered by CPU. A process that used
 * none of a resource never ranks for it, so an idle machine sends a short list.
 */
export function selectTopProcesses(
  usages: readonly ProcessUsage[],
  count: number = LIMITS.topProcesses,
): ProcessUsage[] {
  const selected = new Map<number, ProcessUsage>();
  for (const metric of METRICS) {
    const ranked = usages
      .filter((usage) => usage[metric] > 0)
      .sort((a, b) => b[metric] - a[metric] || a.pid - b.pid)
      .slice(0, count);
    for (const usage of ranked) {
      selected.set(usage.pid, usage);
    }
  }
  return [...selected.values()].sort(
    (a, b) => b.cpuPct - a.cpuPct || b.rssPages - a.rssPages || a.pid - b.pid,
  );
}
