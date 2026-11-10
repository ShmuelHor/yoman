import { LIMITS } from '@yoman/shared/limits';
import { describe, expect, it } from 'vitest';
import {
  CLOCK_TICKS_PER_SECOND,
  measureUsage,
  type ProcessCounters,
  type ProcessScan,
  type ProcessUsage,
  selectTopProcesses,
} from '../../../../src/collectors/pressure/domain/top-processes.js';

type WithPid<T> = Partial<T> & { readonly pid: number };

function counters(values: WithPid<ProcessCounters>): ProcessCounters {
  return {
    comm: `p${values.pid}`,
    kernelThread: false,
    cpuTicks: 0,
    startTicks: 0,
    rssPages: 0,
    ioBytes: 0,
    ...values,
  };
}

function usage(values: WithPid<ProcessUsage>): ProcessUsage {
  return { comm: `p${values.pid}`, cpuPct: 0, rssPages: 0, ioBytesPerSec: 0, ...values };
}

function scan(at: { uptimeSec: number }, processes: readonly ProcessCounters[]): ProcessScan {
  return { uptimeSec: at.uptimeSec, counters: new Map(processes.map((p) => [p.pid, p])) };
}

const SECONDS = CLOCK_TICKS_PER_SECOND;
const TEN_SECONDS = 10 * SECONDS;
/** 90 s in clock ticks. */
const NINETY_SECONDS = 9_000;
const MANY_PROCESSES = 100;
const PRIME_SPREAD = 37;
const PRIME_MOD = 101;

describe('measureUsage', () => {
  it('measures CPU and IO since the previous scan', () => {
    // Arrange: 5 s of CPU and 100 kB of IO over 10 s.
    const before = scan({ uptimeSec: 100 }, [
      counters({ pid: 1, cpuTicks: 1_000, ioBytes: 5_000 }),
    ]);
    const after = scan({ uptimeSec: 110 }, [
      counters({ pid: 1, cpuTicks: 1_500, ioBytes: 105_000, rssPages: 9 }),
    ]);

    // Act / Assert
    expect(measureUsage(after, before)).toEqual([
      usage({ pid: 1, cpuPct: 50, rssPages: 9, ioBytesPerSec: 10_000 }),
    ]);
  });

  it('adds up cores, so a process busy on two of them uses 200%', () => {
    // Arrange
    const before = scan({ uptimeSec: 100 }, [counters({ pid: 1 })]);
    const after = scan({ uptimeSec: 101 }, [counters({ pid: 1, cpuTicks: 2 * SECONDS })]);

    // Act / Assert
    expect(measureUsage(after, before)).toEqual([usage({ pid: 1, cpuPct: 200 })]);
  });

  it('measures a newcomer over its lifetime', () => {
    // Arrange: started 10 s after boot, so 40 s old at uptime 50, with 10 s of CPU.
    const newcomer = counters({
      pid: 2,
      startTicks: TEN_SECONDS,
      cpuTicks: TEN_SECONDS,
      ioBytes: 4_000,
    });

    // Act
    const measured = measureUsage(scan({ uptimeSec: 50 }, [newcomer]), scan({ uptimeSec: 45 }, []));

    // Assert
    expect(measured).toEqual([usage({ pid: 2, cpuPct: 25, ioBytesPerSec: 100 })]);
  });

  it('measures a reused pid as a new process', () => {
    // Arrange: the new process is 100 s old with 10 s of CPU.
    const before = scan({ uptimeSec: 100 }, [
      counters({ pid: 3, startTicks: SECONDS, cpuTicks: NINETY_SECONDS }),
    ]);
    const reused = counters({ pid: 3, startTicks: NINETY_SECONDS, cpuTicks: TEN_SECONDS });

    // Act
    const measured = measureUsage(scan({ uptimeSec: 190 }, [reused]), before);

    // Assert
    expect(measured).toEqual([usage({ pid: 3, cpuPct: 10 })]);
  });

  it('reads no time elapsed as no usage instead of dividing by zero', () => {
    // Arrange
    const same = scan({ uptimeSec: 100 }, [counters({ pid: 1, cpuTicks: 50, ioBytes: 10 })]);

    // Act / Assert
    expect(measureUsage(same, same)).toEqual([usage({ pid: 1 })]);
  });

  it('clamps an implausible rate to the contract limit', () => {
    // Arrange
    const before = scan({ uptimeSec: 100 }, [counters({ pid: 1 })]);
    const after = scan({ uptimeSec: 100.01 }, [counters({ pid: 1, cpuTicks: 1_000_000 })]);

    // Act / Assert
    expect(measureUsage(after, before)).toEqual([usage({ pid: 1, cpuPct: LIMITS.processCpuPct })]);
  });
});

describe('selectTopProcesses', () => {
  it('merges the top by CPU, memory and IO without duplicates, ordered by CPU', () => {
    // Arrange
    const usages = [
      usage({ pid: 1, cpuPct: 5, rssPages: 100 }),
      usage({ pid: 2, cpuPct: 90 }),
      usage({ pid: 3, ioBytesPerSec: 1_000 }),
      usage({ pid: 4, cpuPct: 1, rssPages: 50, ioBytesPerSec: 10 }),
      usage({ pid: 5 }),
    ];

    // Act
    const top = selectTopProcesses(usages, 1);

    // Assert
    expect(top).toEqual([usages[1], usages[0], usages[2]]);
  });

  it('never ranks a process for a resource it did not use', () => {
    // Act / Assert
    expect(selectTopProcesses([usage({ pid: 1 }), usage({ pid: 2 })])).toEqual([]);
  });

  it('keeps at most ten per resource, within the contract limit', () => {
    // Arrange
    const many = Array.from({ length: MANY_PROCESSES }, (_, i) =>
      usage({
        pid: i + 1,
        cpuPct: i,
        rssPages: MANY_PROCESSES - i,
        ioBytesPerSec: (i * PRIME_SPREAD) % PRIME_MOD,
      }),
    );

    // Act
    const top = selectTopProcesses(many);

    // Assert
    const busiest = many.slice(-LIMITS.topProcesses).map((p) => p.pid);
    expect(top.length).toBeLessThanOrEqual(LIMITS.processesPerSample);
    expect(top.map((p) => p.pid)).toEqual(expect.arrayContaining(busiest));
  });
});
