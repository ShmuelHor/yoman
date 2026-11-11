import { defineHandlers } from '../../core/route-handler.js';
import { defaultThresholds } from '../system/thresholds.js';
import { createIngest, noSystemApps } from './ingest-flow.js';

/** The ingest domain: the agent's batch, fanned out to the services. */
export const handlers = defineHandlers({
  ingest: createIngest({ thresholds: defaultThresholds, systemApps: noSystemApps }),
});
