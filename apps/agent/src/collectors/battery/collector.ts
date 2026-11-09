import { BatterySample } from '@yoman/shared/ingest';
import type { Collector, CollectorContext } from '../../core/plugin.js';
import { listBatteries, readBatteryFiles } from './adapters/sysfs.js';
import { type BatteryReading, parseBatteryReading } from './domain/battery-reading.js';
import { combineReadings } from './domain/combine-readings.js';

export const BATTERY_COLLECTOR_NAME = 'battery';
/** SPEC §4.1: battery health changes slowly, so once a minute is enough. */
export const BATTERY_INTERVAL_MS = 60_000;

export interface BatteryCollectorOptions {
  /** The power_supply class directory; tests point it at a fixture tree. */
  readonly root: string;
  readonly now?: () => Date;
}

/**
 * Samples every laptop battery as one pack (SPEC §4.1). Batteries are
 * discovered on the first run; a machine without one disables the collector
 * for the agent's lifetime, so a desktop pays one directory read in total.
 */
export function createBatteryCollector(options: BatteryCollectorOptions): Collector {
  const now = options.now ?? ((): Date => new Date());
  let batteries: readonly string[] | undefined;
  // Each unreadable battery is reported once, not every minute.
  const reported = new Set<string>();

  async function discover(context: CollectorContext): Promise<readonly string[]> {
    if (batteries === undefined) {
      batteries = await listBatteries(options.root);
      if (batteries.length === 0) {
        context.logger.info({ collector: BATTERY_COLLECTOR_NAME }, 'no battery found, disabled');
      }
    }
    return batteries;
  }

  async function read(battery: string, context: CollectorContext): Promise<BatteryReading[]> {
    const reading = parseBatteryReading(await readBatteryFiles(options.root, battery));
    if (reading !== undefined) {
      return [reading];
    }
    if (!reported.has(battery)) {
      reported.add(battery);
      context.logger.warn(
        { collector: BATTERY_COLLECTOR_NAME, battery },
        'battery is absent or reports unusable values, skipped',
      );
    }
    return [];
  }

  return {
    kind: 'collector',
    name: BATTERY_COLLECTOR_NAME,
    intervalMs: BATTERY_INTERVAL_MS,
    async collect(context): Promise<readonly BatterySample[]> {
      const found = await discover(context);
      const readings = await Promise.all(found.map((battery) => read(battery, context)));
      const sample = combineReadings(readings.flat(), now().toISOString());
      if (sample === undefined) {
        return [];
      }
      // sysfs is outside input: the sample is checked against the contract before it is buffered.
      const result = BatterySample.safeParse(sample);
      if (!result.success) {
        const fields = result.error.issues.map((issue) => issue.path.map(String).join('.'));
        context.logger.warn(
          { collector: BATTERY_COLLECTOR_NAME, fields },
          'battery sample out of range, dropped',
        );
        return [];
      }
      return [result.data];
    },
  };
}
