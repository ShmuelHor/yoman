import { z } from 'zod';

import { isTimeZone } from './domain/local-time.js';

/**
 * The focus service's own environment. `TZ` is the zone `until HH:MM` is
 * read in; Node reads the same variable, so the process agrees with it.
 */
export const FocusConfig = z.object({
  TZ: z.string().refine(isTimeZone, { message: 'unknown time zone' }).default('UTC'),
});
export type FocusConfig = z.infer<typeof FocusConfig>;
