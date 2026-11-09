import { z } from 'zod';

import { isTimeZone } from './domain/local-time.js';

/**
 * The reports service's own environment. `TZ` is the zone local days are
 * counted in; Node reads the same variable, so the process agrees with it.
 */
export const ReportsConfig = z.object({
  TZ: z.string().refine(isTimeZone, { message: 'unknown time zone' }).default('UTC'),
});
export type ReportsConfig = z.infer<typeof ReportsConfig>;
