import { ThermalSample } from '@yoman/shared/ingest';
import type { Collector, CollectorContext } from '../../core/plugin.js';
import { discoverThermalSources, readAttributes, type ThermalSources } from './adapters/sysfs.js';
import { cpuTemperature } from './domain/temperature.js';
import { isThrottled, parseThrottleCounts, type ThrottleCounts } from './domain/throttling.js';

export const THERMAL_COLLECTOR_NAME = 'thermal';
/** SPEC §4.1: temperature moves over tens of seconds, so every 30 s. */
export const THERMAL_INTERVAL_MS = 30_000;

export interface ThermalCollectorOptions {
  /** The sysfs mount; tests point it at a fixture tree. */
  readonly root: string;
  readonly now?: () => Date;
}

/**
 * Samples the CPU temperature and whether the CPU was throttled for heat
 * (SPEC §4.1). Sensors are discovered on the first run; a machine without a
 * CPU sensor (a VM, most containers) disables the collector for the agent's
 * lifetime, so it costs a few directory reads in total.
 */
export function createThermalCollector(options: ThermalCollectorOptions): Collector {
  const now = options.now ?? ((): Date => new Date());
  let sources: ThermalSources | undefined;
  let previousCounts: ThrottleCounts | undefined;
  // Reported once, not every 30 s.
  let reportedUnreadable = false;

  async function discover(context: CollectorContext): Promise<ThermalSources> {
    if (sources === undefined) {
      sources = await discoverThermalSources(options.root);
      if (sources.temperatures.length === 0) {
        context.logger.info({ collector: THERMAL_COLLECTOR_NAME }, 'no CPU sensor found, disabled');
      }
    }
    return sources;
  }

  async function throttled(found: ThermalSources): Promise<boolean> {
    const [coolingStates, counterTexts] = await Promise.all([
      readAttributes(found.coolingStates),
      readAttributes(found.throttleCounters),
    ]);
    const counts = parseThrottleCounts(
      new Map(found.throttleCounters.map((path, index) => [path, counterTexts[index]])),
    );
    const result = isThrottled({ coolingStates, counts, previousCounts });
    previousCounts = counts;
    return result;
  }

  return {
    kind: 'collector',
    name: THERMAL_COLLECTOR_NAME,
    intervalMs: THERMAL_INTERVAL_MS,
    async collect(context): Promise<readonly ThermalSample[]> {
      const found = await discover(context);
      if (found.temperatures.length === 0) {
        return [];
      }
      const [readings, wasThrottled] = await Promise.all([
        readAttributes(found.temperatures),
        throttled(found),
      ]);
      const cpuTempC = cpuTemperature(readings);
      if (cpuTempC === undefined) {
        if (!reportedUnreadable) {
          reportedUnreadable = true;
          context.logger.warn(
            { collector: THERMAL_COLLECTOR_NAME },
            'CPU sensors report no usable temperature, skipped',
          );
        }
        return [];
      }
      // sysfs is outside input: the sample is checked against the contract before it is buffered.
      const result = ThermalSample.safeParse({
        kind: 'thermal',
        ts: now().toISOString(),
        cpuTempC,
        throttled: wasThrottled,
      });
      if (!result.success) {
        const fields = result.error.issues.map((issue) => issue.path.map(String).join('.'));
        context.logger.warn(
          { collector: THERMAL_COLLECTOR_NAME, fields },
          'thermal sample out of range, dropped',
        );
        return [];
      }
      return [result.data];
    },
  };
}
