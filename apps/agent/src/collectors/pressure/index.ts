import { PROC_ROOT } from './adapters/procfs.js';
import { createPressureCollector } from './collector.js';

/** Loaded by the collector registry; the folder name is the collector name. */
export const plugin = createPressureCollector({ root: PROC_ROOT });
