import { AppId, Timestamp } from '@yoman/shared/common';
import { LIMITS } from '@yoman/shared/limits';
import { z } from 'zod';

/** The `show-banners` value an app had before the agent changed it. */
export const BannerValue = z.enum(['true', 'false']);
export type BannerValue = z.infer<typeof BannerValue>;

/** What `mute-state.json` holds: enough to undo every change after a crash. */
export const MuteState = z.strictObject({
  endsAt: Timestamp.nullable(),
  originals: z
    .record(AppId, BannerValue)
    .refine((record) => Object.keys(record).length <= LIMITS.listSize, 'too many muted apps'),
});
export type MuteState = z.infer<typeof MuteState>;

export const EMPTY_MUTE_STATE: MuteState = { endsAt: null, originals: {} };

/** True when the focus session is over, so everything must be restored. */
export function isExpired(state: MuteState, now: Date): boolean {
  return state.endsAt !== null && new Date(state.endsAt).getTime() < now.getTime();
}
