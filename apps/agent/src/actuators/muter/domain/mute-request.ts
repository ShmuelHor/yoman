import { AppId, Timestamp } from '@yoman/shared/common';
import { MuteCommands } from '@yoman/shared/focus';
import { LIMITS } from '@yoman/shared/limits';
import { z } from 'zod';

/** The gateway's mute commands, plus what the muter needs to keep them safe. */
export const MuteRequest = MuteCommands.extend({
  /** When the focus session ends; the muter restores by itself after this. */
  endsAt: Timestamp.optional(),
  /** `Settings.systemApps`: apps that must never be muted. */
  systemApps: z.array(AppId).max(LIMITS.listSize).default([]),
});
export type MuteRequest = z.infer<typeof MuteRequest>;
