import { POWER_SUPPLY_ROOT } from './adapters/sysfs.js';
import { createBatteryCollector } from './collector.js';

/** Loaded by the collector registry; the folder name is the collector name. */
export const plugin = createBatteryCollector({ root: POWER_SUPPLY_ROOT });
