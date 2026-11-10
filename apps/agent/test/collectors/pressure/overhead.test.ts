import { readdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROC_ROOT } from '../../../src/collectors/pressure/adapters/procfs.js';
import {
  createPressureCollector,
  PRESSURE_INTERVAL_MS,
} from '../../../src/collectors/pressure/collector.js';
import { SNAPSHOT_EVERY_MS } from '../../../src/collectors/pressure/domain/snapshot-schedule.js';
import { createLogger } from '../../../src/core/logger.js';
import type { Collector, CollectorContext } from '../../../src/core/plugin.js';
import { recordedPresence, unreachableSessionBus } from '../../support/collector-context.js';
import { ProcTree } from './proc-tree.js';

/** SPEC §4.4: the whole agent averages at most 0.5% of one CPU. */
const AGENT_CPU_BUDGET = 0.005;
/**
 * This collector's share of the budget on a calm machine, leaving the rest
 * for the window, idle, battery and thermal collectors and the sender.
 */
const CALM_SHARE = 0.2;
/** Two and a half minutes of polls under load. */
const LOADED_TICKS = 30;
const MICROSECONDS_PER_MS = 1_000;
/**
 * Each measurement is repeated and the lowest kept: other test files running
 * in parallel inflate CPU time through cache and scheduler contention, while
 * the lowest run is closest to what the collector itself costs.
 */
const REPETITIONS = 3;
const BUSY = { cpu: 90 };

function context(): CollectorContext {
  return {
    logger: createLogger({ level: 'silent' }),
    sessionBus: unreachableSessionBus(),
    ...recordedPresence(),
    emit: (): Promise<void> => Promise.resolve(),
  };
}

/**
 * Runs `ticks` polls 5 s apart on a fake clock and returns the CPU time they
 * used (user plus system) as a share of the wall time they stand for.
 */
async function lowestCpuShare(collector: Collector, ticks: number, clock: Clock): Promise<number> {
  const shares: number[] = [];
  for (let run = 0; run < REPETITIONS; run += 1) {
    shares.push(await cpuShare(collector, ticks, clock));
  }
  return Math.min(...shares);
}

async function cpuShare(collector: Collector, ticks: number, clock: Clock): Promise<number> {
  const ctx = context();
  const collect = collector.collect?.bind(collector);
  if (collect === undefined) {
    throw new Error('the pressure collector polls');
  }
  // The first poll takes the baseline snapshot and warms up the code.
  await collect(ctx);
  const before = process.cpuUsage();
  for (let tick = 0; tick < ticks; tick += 1) {
    clock.advance(PRESSURE_INTERVAL_MS);
    await collect(ctx);
  }
  const used = process.cpuUsage(before);
  const cpuMs = (used.user + used.system) / MICROSECONDS_PER_MS;
  return cpuMs / (ticks * PRESSURE_INTERVAL_MS);
}

/**
 * Real processes with controlled pressure: every process directory and
 * `uptime` link to the live `/proc`, while `pressure` and `meminfo` are
 * fixtures, so a test decides whether the machine counts as loaded.
 */
async function liveProcesses(tree: ProcTree): Promise<number> {
  const pids = (await readdir(PROC_ROOT)).filter((name) => /^\d+$/.test(name));
  await Promise.all(pids.map((pid) => symlink(join(PROC_ROOT, pid), join(tree.root, pid))));
  await symlink(join(PROC_ROOT, 'uptime'), join(tree.root, 'uptime'));
  await tree.setMemory({ availablePct: 50 });
  return pids.length;
}

interface Clock {
  readonly now: () => Date;
  advance(ms: number): void;
}

function clock(): Clock {
  let current = 0;
  return {
    now: (): Date => new Date(current),
    advance: (ms): void => {
      current += ms;
    },
  };
}

describe('pressure collector overhead (SPEC §4.4 battery budget)', () => {
  let tree: ProcTree;
  let processCount = 0;

  beforeAll(async () => {
    tree = await ProcTree.create();
    processCount = await liveProcesses(tree);
  });

  afterAll(async () => {
    await tree.remove();
  });

  it('scans a real process table', () => {
    // Assert: the measurements below mean something only with real processes behind them.
    expect(processCount).toBeGreaterThan(1);
  });

  it('stays within its share of the budget on a calm machine', async () => {
    // Arrange
    await tree.setPressure();
    const time = clock();
    const collector = createPressureCollector({ root: tree.root, now: time.now });

    // Act: 5 minutes of polls, ending in the routine snapshot.
    const share = await lowestCpuShare(collector, SNAPSHOT_EVERY_MS / PRESSURE_INTERVAL_MS, time);

    // Assert
    expect(share).toBeLessThan(AGENT_CPU_BUDGET * CALM_SHARE);
  });

  it('stays within the whole agent budget while under load', async () => {
    // Arrange
    await tree.setPressure(BUSY);
    const time = clock();
    const collector = createPressureCollector({ root: tree.root, now: time.now });

    // Act: a long incident, with a snapshot every third poll.
    const share = await lowestCpuShare(collector, LOADED_TICKS, time);

    // Assert
    expect(share).toBeLessThan(AGENT_CPU_BUDGET);
  });
});
