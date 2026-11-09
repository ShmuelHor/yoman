import { z } from 'zod';

import { isTimeZone } from './domain/local-time.js';

/**
 * The battery service's own environment. `TZ` is the zone local days are
 * counted in, as in the reports service; Node reads the same variable, so the
 * process agrees with it.
 */
export const BatteryConfig = z.object({
  TZ: z.string().refine(isTimeZone, { message: 'unknown time zone' }).default('UTC'),
});
export type BatteryConfig = z.infer<typeof BatteryConfig>;
