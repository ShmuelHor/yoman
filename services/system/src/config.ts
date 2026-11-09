import { z } from 'zod';

import { isTimeZone } from './domain/local-time.js';

/**
 * The system service's own environment. `TZ` is the zone the timeline's local
 * days are counted in; Node reads the same variable, so the process agrees with it.
 */
export const SystemConfig = z.object({
  TZ: z.string().refine(isTimeZone, { message: 'unknown time zone' }).default('UTC'),
});
export type SystemConfig = z.infer<typeof SystemConfig>;
