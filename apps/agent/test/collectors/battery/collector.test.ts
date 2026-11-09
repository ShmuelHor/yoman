import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sample } from '@yoman/shared/ingest';
import { LIMITS } from '@yoman/shared/limits';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BATTERY_INTERVAL_MS,
  createBatteryCollector,
} from '../../../src/collectors/battery/collector.js';
import { createLogger } from '../../../src/core/logger.js';
import type { Collector, CollectorContext } from '../../../src/core/plugin.js';
import { recordedPresence, unreachableSessionBus } from '../../support/collector-context.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const NOW = new Date('2026-11-09T08:00:00.000Z');
const TS = NOW.toISOString();

const MICROWATTS_PER_WATT = 1_000_000;

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

function collectorFor(fixture: string): Collector {
  return createBatteryCollector({ root: join(FIXTURES, fixture), now: () => NOW });
}

async function collect(collector: Collector, ctx: CollectorContext): Promise<readonly Sample[]> {
  if (collector.collect === undefined) {
    throw new Error('the battery collector polls');
  }
  return collector.collect(ctx);
}

describe('battery collector', () => {
  it('polls once a minute', () => {
    // Act / Assert
    expect(collectorFor('laptop')).toMatchObject({
      kind: 'collector',
      name: 'battery',
      intervalMs: BATTERY_INTERVAL_MS,
    });
  });

  it('samples a laptop battery', async () => {
    // Act
    const samples = await collect(collectorFor('laptop'), context());

    // Assert
    expect(samples).toEqual([
      {
        kind: 'battery',
        ts: TS,
        energyFullWh: 45.12,
        energyFullDesignWh: 57.02,
        cycleCount: 312,
        powerW: 8.45,
        capacityPct: 76,
        status: 'discharging',
      },
    ]);
  });

  it('samples a charge-based driver', async () => {
    // Act
    const samples = await collect(collectorFor('charge-based'), context());

    // Assert
    expect(samples).toEqual([
      {
        kind: 'battery',
        ts: TS,
        energyFullWh: 45.6,
        energyFullDesignWh: 57,
        cycleCount: 0,
        powerW: 18,
        capacityPct: 50,
        status: 'charging',
      },
    ]);
  });

  it('combines two batteries and skips a removed one', async () => {
    // Act
    const samples = await collect(collectorFor('dual'), context());

    // Assert
    expect(samples).toEqual([
      {
        kind: 'battery',
        ts: TS,
        energyFullWh: 80,
        energyFullDesignWh: 96,
        cycleCount: 300,
        powerW: 8,
        capacityPct: 60,
        status: 'discharging',
      },
    ]);
  });

  it('disables itself on a desktop and says so once', async () => {
    // Arrange
    const ctx = context();
    const collector = collectorFor('desktop');

    // Act
    const first = await collect(collector, ctx);
    const second = await collect(collector, ctx);

    // Assert
    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(ctx.logs).toEqual([
      expect.objectContaining({ collector: 'battery', msg: 'no battery found, disabled' }),
    ]);
  });

  it('warns once about a battery with unusable values and samples nothing', async () => {
    // Arrange
    const ctx = context();
    const collector = collectorFor('broken');

    // Act
    const first = await collect(collector, ctx);
    const second = await collect(collector, ctx);

    // Assert
    expect([...first, ...second]).toEqual([]);
    expect(ctx.logs).toEqual([expect.objectContaining({ collector: 'battery', battery: 'BAT0' })]);
  });

  describe('with a writable sysfs tree', () => {
    let root: string;

    async function writeBattery(files: Readonly<Record<string, string>>): Promise<void> {
      await mkdir(join(root, 'BAT0'), { recursive: true });
      for (const [name, value] of Object.entries(files)) {
        await writeFile(join(root, 'BAT0', name), `${value}\n`);
      }
    }

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'yoman-battery-'));
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it('stays disabled when a battery appears after the first run', async () => {
      // Arrange
      const ctx = context();
      const collector = createBatteryCollector({ root, now: () => NOW });
      await collect(collector, ctx);
      await writeBattery({ capacity: '50', energy_full: '1000000', energy_full_design: '1000000' });

      // Act / Assert
      expect(await collect(collector, ctx)).toEqual([]);
    });

    it('drops a sample outside the contract limits and names only the field', async () => {
      // Arrange: a power draw no laptop reaches.
      const microwatts = String((LIMITS.watts + 1) * MICROWATTS_PER_WATT);
      await writeBattery({
        capacity: '50',
        energy_full: '1000000',
        energy_full_design: '1000000',
        power_now: microwatts,
      });
      const ctx = context();

      // Act
      const samples = await collect(createBatteryCollector({ root, now: () => NOW }), ctx);

      // Assert
      expect(samples).toEqual([]);
      expect(ctx.logs).toEqual([
        expect.objectContaining({
          fields: ['powerW'],
          msg: 'battery sample out of range, dropped',
        }),
      ]);
    });

    it('stamps samples with the current time by default', async () => {
      // Arrange
      await writeBattery({ capacity: '50', energy_full: '1000000', energy_full_design: '1000000' });
      const before = Date.now();

      // Act
      const [sample] = await collect(createBatteryCollector({ root }), context());

      // Assert
      expect(Date.parse(sample?.ts ?? '')).toBeGreaterThanOrEqual(before);
    });
  });
});
