import { z } from 'zod';
import { Timestamp } from './common.js';
import { LIMITS } from './limits.js';

/** How urgent an alert is. Decides whether it gets through during focus (SPEC §5 focus). */
export const AlertLevel = z.enum(['critical', 'important', 'normal']);
export type AlertLevel = z.infer<typeof AlertLevel>;

/** Every alert the product can raise, from SPEC §5 battery and system. */
export const AlertType = z.enum([
  'battery-low',
  'battery-critical',
  'battery-plugged-full',
  'pressure-incident',
  'memory-critical',
  'thermal',
  'memory-leak',
]);
export type AlertType = z.infer<typeof AlertType>;

/** Values interpolated into a notification's i18n message. Bounded in count and size. */
export const AlertParams = z
  .record(
    z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,31}$/),
    z.union([z.string().max(LIMITS.paramValueLength), z.number().finite()]),
  )
  .refine((params) => Object.keys(params).length <= LIMITS.paramCount, {
    message: `at most ${LIMITS.paramCount} params`,
  });
export type AlertParams = z.infer<typeof AlertParams>;

export const Alert = z.strictObject({
  /** Rate-limit key: at most one alert per `alertKey` per 10 min. */
  alertKey: z.string().regex(/^[a-zA-Z0-9:._-]{1,128}$/),
  type: AlertType,
  level: AlertLevel,
  ts: Timestamp,
  params: AlertParams,
});
export type Alert = z.infer<typeof Alert>;

export const QueuedAlert = z.strictObject({
  alert: Alert,
  queuedAt: Timestamp,
});
export type QueuedAlert = z.infer<typeof QueuedAlert>;
