import { z } from 'zod';
import { AppId, ClockTime, Percent } from './common.js';
import { LIMITS } from './limits.js';

export const Language = z.enum(['he', 'en']);
export type Language = z.infer<typeof Language>;

export const Theme = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof Theme>;

/** `gateway.settings`, the only data the gateway owns (SPEC §5 gateway). */
export const Settings = z.strictObject({
  language: Language,
  theme: Theme,
  privacy: z.strictObject({
    storeTitles: z.boolean(),
    /** Apps that are not tracked at all. */
    excludedApps: z.array(AppId).max(LIMITS.listSize),
  }),
  /** `some avg10` thresholds that open an incident. Defaults: memory 10, cpu 40, io 30. */
  thresholds: z.strictObject({ memory: Percent, cpu: Percent, io: Percent }),
  /** Apps that must never be muted, on top of the built-in list in SPEC §4.2. */
  systemApps: z.array(AppId).max(LIMITS.listSize),
  quietHours: z.discriminatedUnion('enabled', [
    z.strictObject({ enabled: z.literal(false) }),
    z.strictObject({ enabled: z.literal(true), start: ClockTime, end: ClockTime }),
  ]),
});
export type Settings = z.infer<typeof Settings>;
