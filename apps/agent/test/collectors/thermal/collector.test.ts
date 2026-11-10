import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sample } from '@yoman/shared/ingest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createThermalCollector,
  THERMAL_INTERVAL_MS,
} from '../../../src/collectors/thermal/collector.js';
import type { Collector, CollectorContext } from '../../../src/core/plugin.js';
import { recordedPresence, unreachableSessionBus } from '../../support/collector-context.js';
import { recordingLogger } from '../../support/logs.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const NOW = new Date('2026-11-09T08:00:00.000Z');
const TS = NOW.toISOString();

const CORE_COUNTER = join(
  'devices',
  'system',
  'cpu',
  'cpu1',
  'thermal_throttle',
  'core_throttle_count',
);
const PROCESSOR_COOLING = join('class', 'thermal', 'cooling_device1', 'cur_state');
const HOTTEST_CORE = join('class', 'hwmon', 'hwmon2', 'temp3_input');
const CPU_SENSORS = ['temp1_input', 'temp2_input', 'temp3_input', 'temp10_input'].map((input) =>
  join('class', 'hwmon', 'hwmon2', input),
);

function context(): CollectorContext & { logs: unknown[] } {
  const { logger, logs } = recordingLogger();
  return {
    logs,
    logger,
    sessionBus: unreachableSessionBus(),
    ...recordedPresence(),
    emit: (): Promise<void> => Promise.resolve(),
  };
}

function collectorAt(root: string): Collector {
  return createThermalCollector({ root, now: () => NOW });
}

async function collect(collector: Collector, ctx: CollectorContext): Promise<readonly Sample[]> {
  if (collector.collect === undefined) {
    throw new Error('the thermal collector polls');
  }
  return collector.collect(ctx);
}

describe('thermal collector', () => {
  it('polls every 30 seconds', () => {
    // Act / Assert
    expect(collectorAt(join(FIXTURES, 'intel-laptop'))).toMatchObject({
      kind: 'collector',
      name: 'thermal',
      intervalMs: THERMAL_INTERVAL_MS,
    });
  });

  it('samples the hottest CPU sensor of a laptop', async () => {
    // Act
    const samples = await collect(collectorAt(join(FIXTURES, 'intel-laptop')), context());

    // Assert
    expect(samples).toEqual([{ kind: 'thermal', ts: TS, cpuTempC: 61, throttled: false }]);
  });

  it('samples a board that only has a CPU thermal zone, throttled by frequency capping', async () => {
    // Act
    const samples = await collect(collectorAt(join(FIXTURES, 'arm-board')), context());

    // Assert
    expect(samples).toEqual([{ kind: 'thermal', ts: TS, cpuTempC: 64.3, throttled: true }]);
  });

  it('disables itself on a machine without a CPU sensor and says so once', async () => {
    // Arrange
    const collector = collectorAt(join(FIXTURES, 'virtual-machine'));
    const ctx = context();

    // Act
    const first = await collect(collector, ctx);
    const second = await collect(collector, ctx);

    // Assert
    expect([...first, ...second]).toEqual([]);
    expect(ctx.logs).toEqual([
      expect.objectContaining({
        collector: 'thermal',
        msg: 'no CPU sensor found, disabled',
      }),
    ]);
  });

  it('skips a tick when the CPU sensors report nothing usable and warns once', async () => {
    // Arrange
    const collector = collectorAt(join(FIXTURES, 'broken'));
    const ctx = context();

    // Act
    const first = await collect(collector, ctx);
    const second = await collect(collector, ctx);

    // Assert
    expect([...first, ...second]).toEqual([]);
    expect(ctx.logs).toEqual([
      expect.objectContaining({
        collector: 'thermal',
        msg: 'CPU sensors report no usable temperature, skipped',
      }),
    ]);
  });

  describe('over several ticks', () => {
    let root: string;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'yoman-thermal-'));
      await cp(join(FIXTURES, 'intel-laptop'), root, { recursive: true });
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it('reports throttling when a hardware throttle counter goes up between ticks', async () => {
      // Arrange
      const collector = collectorAt(root);
      const ctx = context();
      await collect(collector, ctx);
      await writeFile(join(root, CORE_COUNTER), '8\n');

      // Act
      const samples = await collect(collector, ctx);

      // Assert
      expect(samples).toEqual([expect.objectContaining({ throttled: true })]);
    });

    it('stops reporting throttling once the counters stand still', async () => {
      // Arrange
      const collector = collectorAt(root);
      const ctx = context();
      await collect(collector, ctx);
      await writeFile(join(root, CORE_COUNTER), '8\n');
      await collect(collector, ctx);

      // Act
      const samples = await collect(collector, ctx);

      // Assert
      expect(samples).toEqual([expect.objectContaining({ throttled: false })]);
    });

    it('reports throttling while the processor cooling device is engaged', async () => {
      // Arrange
      await writeFile(join(root, PROCESSOR_COOLING), '3\n');

      // Act
      const samples = await collect(collectorAt(root), context());

      // Assert
      expect(samples).toEqual([expect.objectContaining({ throttled: true })]);
    });

    it('follows the temperature as it changes', async () => {
      // Arrange
      const collector = collectorAt(root);
      const ctx = context();
      await collect(collector, ctx);
      await writeFile(join(root, HOTTEST_CORE), '96500\n');

      // Act
      const samples = await collect(collector, ctx);

      // Assert
      expect(samples).toEqual([expect.objectContaining({ cpuTempC: 96.5 })]);
    });

    it('keeps sampling the sensors that remain when some go away', async () => {
      // Arrange
      const collector = collectorAt(root);
      const ctx = context();
      await collect(collector, ctx);
      await rm(join(root, HOTTEST_CORE));

      // Act
      const samples = await collect(collector, ctx);

      // Assert
      expect(samples).toEqual([expect.objectContaining({ cpuTempC: 58 })]);
    });

    it('skips a tick when every CPU sensor has gone away', async () => {
      // Arrange
      const collector = collectorAt(root);
      const ctx = context();
      await collect(collector, ctx);
      await Promise.all(CPU_SENSORS.map((sensor) => rm(join(root, sensor))));

      // Act
      const samples = await collect(collector, ctx);

      // Assert
      expect(samples).toEqual([]);
    });
  });
});
