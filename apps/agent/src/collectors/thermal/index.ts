import { SYS_ROOT } from './adapters/sysfs.js';
import { createThermalCollector } from './collector.js';

/** Loaded by the collector registry; the folder name is the collector name. */
export const plugin = createThermalCollector({ root: SYS_ROOT });
