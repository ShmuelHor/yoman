import { defineHandlers } from '../../core/route-handler.js';
import { ingest } from './ingest-flow.js';

/** The ingest domain: the agent's batch, fanned out to the services. */
export const handlers = defineHandlers({ ingest });
