import type { Sample } from '@yoman/shared/ingest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createPressureCollector,
  PRESSURE_INTERVAL_MS,
} from '../../../src/collectors/pressure/collector.js';
import { SNAPSHOT_EVERY_MS } from '../../../src/collectors/pressure/domain/snapshot-schedule.js';
import { CLOCK_TICKS_PER_SECOND } from '../../../src/collectors/pressure/domain/top-processes.js';
import { createLogger } from '../../../src/core/logger.js';
import type { Collector, CollectorContext } from '../../../src/core/plugin.js';
import { recordedPresence, unreachableSessionBus } from '../../support/collector-context.js';
import { ProcTree } from './proc-tree.js';

const START = new Date('2026-11-09T08:00:00.000Z');
const BUSY = { cpu: 55.5 };
const UPTIME_SEC = 1_000;
const TEN_SECONDS = 10 * CLOCK_TICKS_PER_SECOND;
const PLENTY_OF_MEMORY = { availablePct: 50 };

interface Clock {
  readonly now: () => Date;
  advance(ms: number): void;
}

function clock(): Clock {
  let current = START.getTime();
  return {
    now: (): Date => new Date(current),
    advance: (ms): void => {
      current += ms;
    },
  };
}

function context(): CollectorContext & { logs: unknown[] } {
  const logs: unknown[] = [];
  const destination = {
    write: (line: string): void => {
      const entry: unknown = JSON.parse(line);
      logs.push(entry);
    },
  };
  return {
    logs,
    logger: createLogger({ level: 'info', destination }),
    sessionBus: unreachableSessionBus(),
    ...recordedPresence(),
    emit: (): Promise<void> => Promise.resolve(),
  };
}

async function collect(collector: Collector, ctx: CollectorContext): Promise<readonly Sample[]> {
  if (collector.collect === undefined) {
    throw new Error('the pressure collector polls');
  }
  return collector.collect(ctx);
}

function kinds(samples: readonly Sample[]): string[] {
  return samples.map((sample) => sample.kind);
}

describe('pressure collector', () => {
  let tree: ProcTree;
  let time: Clock;
  let collector: Collector;

  beforeEach(async () => {
    tree = await ProcTree.create();
    await tree.setPressure();
    await tree.setMemory(PLENTY_OF_MEMORY);
    await tree.setUptime(UPTIME_SEC);
    await tree.setProcess({ pid: 1, comm: 'systemd', rssPages: 3, rssKb: 12 });
    time = clock();
    collector = createPressureCollector({ root: tree.root, now: time.now });
  });

  afterEach(async () => {
    await tree.remove();
  });

  it('polls every 5 seconds', () => {
    // Act / Assert
    expect(collector).toMatchObject({
      kind: 'collector',
      name: 'pressure',
      intervalMs: PRESSURE_INTERVAL_MS,
    });
  });

  it('samples pressure stall and memory', async () => {
    // Arrange
    await tree.setPressure({ cpu: 12.5, memory: 3, io: 7.25 });
    await tree.setMemory({ availablePct: 20, swapUsedKb: 4 });

    // Act
    const [pressure] = await collect(collector, context());

    // Assert
    expect(pressure).toEqual({
      kind: 'pressure',
      ts: START.toISOString(),
      cpu: { some: 12.5, full: 0 },
      memory: { some: 3, full: 0 },
      io: { some: 7.25, full: 0 },
      memAvailablePct: 20,
      swapActive: true,
    });
  });

  it('takes the first process snapshot right away, then one every 5 minutes on a calm machine', async () => {
    // Arrange
    const ctx = context();
    const ticks: string[][] = [];

    // Act
    ticks.push(kinds(await collect(collector, ctx)));
    time.advance(PRESSURE_INTERVAL_MS);
    ticks.push(kinds(await collect(collector, ctx)));
    time.advance(SNAPSHOT_EVERY_MS - PRESSURE_INTERVAL_MS);
    ticks.push(kinds(await collect(collector, ctx)));

    // Assert
    expect(ticks).toEqual([['pressure', 'processes'], ['pressure'], ['pressure', 'processes']]);
  });

  it('takes a process snapshot on every tick under load', async () => {
    // Arrange
    const ctx = context();
    await collect(collector, ctx);
    await tree.setPressure(BUSY);

    // Act
    time.advance(PRESSURE_INTERVAL_MS);
    const first = await collect(collector, ctx);
    time.advance(PRESSURE_INTERVAL_MS);
    const second = await collect(collector, ctx);

    // Assert
    expect(kinds(first)).toEqual(['pressure', 'processes']);
    expect(kinds(second)).toEqual(['pressure', 'processes']);
  });

  it('names the process that used the CPU since the last snapshot', async () => {
    // Arrange
    const ctx = context();
    await tree.setProcess({ pid: 42, comm: 'cargo', cpuTicks: 0, rssPages: 1, rssKb: 4 });
    await collect(collector, ctx);
    await tree.setPressure(BUSY);
    await tree.setUptime(UPTIME_SEC + 10);
    await tree.setProcess({ pid: 42, comm: 'cargo', cpuTicks: TEN_SECONDS, rssPages: 1, rssKb: 4 });

    // Act
    time.advance(PRESSURE_INTERVAL_MS);
    const samples = await collect(collector, ctx);

    // Assert
    expect(samples[1]).toEqual({
      kind: 'processes',
      ts: time.now().toISOString(),
      processes: [
        { pid: 42, comm: 'cargo', cpuPct: 100, rssBytes: 4_096, ioBytesPerSec: 0 },
        { pid: 1, comm: 'systemd', cpuPct: 0, rssBytes: 12_288, ioBytesPerSec: 0 },
      ],
    });
  });

  it('snapshots processes when memory runs out while swapping, even without PSI', async () => {
    // Arrange
    const ctx = context();
    await collect(collector, ctx);
    await tree.remove();
    tree = await ProcTree.create();
    collector = createPressureCollector({ root: tree.root, now: time.now });
    await tree.setMemory({ availablePct: 2, swapUsedKb: 1 });
    await tree.setUptime(UPTIME_SEC);
    await collect(collector, ctx);

    // Act
    time.advance(PRESSURE_INTERVAL_MS);
    const samples = await collect(collector, ctx);

    // Assert
    expect(kinds(samples)).toEqual(['processes']);
    expect(ctx.logs).toEqual([
      expect.objectContaining({
        collector: 'pressure',
        msg: 'pressure stall information unavailable, only processes are sampled',
      }),
    ]);
  });

  it('skips a process that exits before its memory is read', async () => {
    // Arrange
    await tree.setProcess({ pid: 7, comm: 'gone', rssPages: 9, rssKb: 36 });
    await tree.removeFile({ pid: 7, file: 'status' });

    // Act
    const samples = await collect(collector, context());

    // Assert
    expect(samples[1]).toMatchObject({ processes: [{ pid: 1, comm: 'systemd' }] });
  });

  it('skips a process whose stat names another pid', async () => {
    // Arrange
    await tree.setProcess({ pid: 8, comm: 'liar', rssPages: 9, rssKb: 36 });
    await tree.setProcess({ pid: 9, comm: 'liar', rssPages: 9, rssKb: 36 });
    await tree.copyStat({ from: 9, to: 8 });

    // Act
    const samples = await collect(collector, context());

    // Assert
    expect(samples[1]).toMatchObject({
      processes: [
        { pid: 9, comm: 'liar' },
        { pid: 1, comm: 'systemd' },
      ],
    });
  });

  it('sends no process snapshot when uptime is unreadable', async () => {
    // Arrange
    await tree.setUptime(Number.NaN);

    // Act
    const samples = await collect(collector, context());

    // Assert
    expect(kinds(samples)).toEqual(['pressure']);
  });

  it('drops a pressure sample when meminfo is unreadable', async () => {
    // Arrange
    await tree.setMeminfoText('garbage');

    // Act
    const samples = await collect(collector, context());

    // Assert
    expect(kinds(samples)).toEqual(['processes']);
  });
});
