import { createIdleCollector } from './collector.js';

/** Loaded by the collector registry; the folder name is the collector name. */
export const plugin = createIdleCollector();
