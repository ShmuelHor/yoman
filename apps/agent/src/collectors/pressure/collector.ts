import type { Sample } from '@yoman/shared/ingest';
import { PressureSample, type ProcessInfo, ProcessSample } from '@yoman/shared/ingest';
import type { z } from 'zod';
import type { Collector, CollectorContext } from '../../core/plugin.js';
import {
  listPids,
  readMeminfo,
  readPressureFiles,
  readProcessFile,
  readUptime,
} from './adapters/procfs.js';
import { isUnderLoad } from './domain/load.js';
import { type MemoryReading, parseMemoryReading } from './domain/memory.js';
import { type PressureReading, parsePressureReading } from './domain/pressure.js';
import {
  parseProcessIo,
  parseProcessStat,
  parseResidentBytes,
  parseUptime,
} from './domain/process-files.js';
import { isSnapshotDue } from './domain/snapshot-schedule.js';
import {
  measureUsage,
  type ProcessCounters,
  type ProcessScan,
  selectTopProcesses,
} from './domain/top-processes.js';

export const PRESSURE_COLLECTOR_NAME = 'pressure';
/** SPEC §4.1: PSI is very cheap to read, so every 5 s. */
export const PRESSURE_INTERVAL_MS = 5_000;

export interface PressureCollectorOptions {
  /** The procfs mount; tests point it at a fixture tree. */
  readonly root: string;
  readonly now?: () => Date;
}

function readCounters(root: string, pid: number): ProcessCounters | undefined {
  const statText = readProcessFile(root, pid, 'stat');
  const stat = statText === undefined ? undefined : parseProcessStat(statText);
  // A pid that does not match its directory is a malformed or hostile file.
  if (stat === undefined || stat.pid !== pid) {
    return undefined;
  }
  const ioText = readProcessFile(root, pid, 'io');
  return { ...stat, ioBytes: (ioText === undefined ? undefined : parseProcessIo(ioText)) ?? 0 };
}

function scanProcesses(root: string): ProcessScan | undefined {
  const uptimeText = readUptime(root);
  const uptimeSec = uptimeText === undefined ? undefined : parseUptime(uptimeText);
  if (uptimeSec === undefined) {
    return undefined;
  }
  const counters = new Map<number, ProcessCounters>();
  for (const pid of listPids(root)) {
    const process = readCounters(root, pid);
    if (process !== undefined) {
      counters.set(pid, process);
    }
  }
  return { uptimeSec, counters };
}

/** Resident bytes for a selected process; `undefined` once it has exited. */
function residentBytes(root: string, pid: number): number | undefined {
  const status = readProcessFile(root, pid, 'status');
  return status === undefined ? undefined : parseResidentBytes(status);
}

interface LoadReading {
  readonly pressure: PressureReading | undefined;
  readonly memory: MemoryReading | undefined;
}

function fieldPaths(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.path.map(String).join('.'));
}

/**
 * Samples pressure stall information every 5 s and, under load or every
 * 5 minutes, the heaviest processes (SPEC §4.1). Processes are identified by
 * pid and `comm` only; their command lines are never read (SECURITY A12).
 */
export function createPressureCollector(options: PressureCollectorOptions): Collector {
  const now = options.now ?? ((): Date => new Date());
  let previousScan: ProcessScan | undefined;
  let lastSnapshotMs: number | undefined;
  let reportedNoPsi = false;

  function readLoad(context: CollectorContext): LoadReading {
    const pressure = parsePressureReading(readPressureFiles(options.root));
    const meminfo = readMeminfo(options.root);
    const memory = meminfo === undefined ? undefined : parseMemoryReading(meminfo);
    if (pressure === undefined && !reportedNoPsi) {
      reportedNoPsi = true;
      context.logger.warn(
        { collector: PRESSURE_COLLECTOR_NAME },
        'pressure stall information unavailable, only processes are sampled',
      );
    }
    return { pressure, memory };
  }

  function pressureSample(
    context: CollectorContext,
    load: LoadReading,
    ts: string,
  ): PressureSample[] {
    if (load.pressure === undefined || load.memory === undefined) {
      return [];
    }
    // procfs is outside input: the sample is checked against the contract before it is buffered.
    const result = PressureSample.safeParse({
      kind: 'pressure',
      ts,
      ...load.pressure,
      ...load.memory,
    });
    if (!result.success) {
      context.logger.warn(
        { collector: PRESSURE_COLLECTOR_NAME, fields: fieldPaths(result.error) },
        'pressure sample out of range, dropped',
      );
      return [];
    }
    return [result.data];
  }

  function processSample(context: CollectorContext, ts: string): ProcessSample[] {
    const scan = scanProcesses(options.root);
    if (scan === undefined) {
      return [];
    }
    const top = selectTopProcesses(measureUsage(scan, previousScan));
    previousScan = scan;
    const processes = top.flatMap((usage): ProcessInfo[] => {
      const rssBytes = residentBytes(options.root, usage.pid);
      if (rssBytes === undefined) {
        return [];
      }
      const { pid, comm, cpuPct, ioBytesPerSec } = usage;
      return [{ pid, comm, cpuPct, rssBytes, ioBytesPerSec }];
    });
    const result = ProcessSample.safeParse({ kind: 'processes', ts, processes });
    if (!result.success) {
      context.logger.warn(
        { collector: PRESSURE_COLLECTOR_NAME, fields: fieldPaths(result.error) },
        'process sample out of range, dropped',
      );
      return [];
    }
    return [result.data];
  }

  return {
    kind: 'collector',
    name: PRESSURE_COLLECTOR_NAME,
    intervalMs: PRESSURE_INTERVAL_MS,
    collect(context): Promise<readonly Sample[]> {
      const at = now();
      const ts = at.toISOString();
      const load = readLoad(context);
      const samples: Sample[] = pressureSample(context, load, ts);
      const underLoad = isUnderLoad(load.pressure, load.memory);
      if (isSnapshotDue(underLoad, at.getTime(), lastSnapshotMs)) {
        lastSnapshotMs = at.getTime();
        samples.push(...processSample(context, ts));
      }
      return Promise.resolve(samples);
    },
  };
}
