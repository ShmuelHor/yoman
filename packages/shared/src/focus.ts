import { z } from 'zod';
import { AlertLevel, AlertType, QueuedAlert } from './alerts.js';
import { AppId, ClockTime, EntityId, Label, Timestamp } from './common.js';
import { LIMITS } from './limits.js';

const AppIdList = z.array(AppId).max(LIMITS.listSize);

export const ProfileInput = z.strictObject({
  name: Label,
  mutedApps: AppIdList,
  /** Apps that keep notifying even when `muteNewApps` is on. */
  exceptions: AppIdList,
  muteNewApps: z.boolean(),
});
export type ProfileInput = z.infer<typeof ProfileInput>;

export const Profile = z.strictObject({ id: EntityId, ...ProfileInput.shape });
export type Profile = z.infer<typeof Profile>;

export const ProfileList = z.strictObject({ items: z.array(Profile).max(LIMITS.listSize) });
export type ProfileList = z.infer<typeof ProfileList>;

export const FocusSource = z.enum(['manual', 'schedule', 'pomodoro', 'auto']);
export type FocusSource = z.infer<typeof FocusSource>;

export const FocusState = z.discriminatedUnion('active', [
  z.strictObject({ active: z.literal(false) }),
  z.strictObject({
    active: z.literal(true),
    profileId: EntityId,
    source: FocusSource,
    startedAt: Timestamp,
    endsAt: Timestamp,
  }),
]);
export type FocusState = z.infer<typeof FocusState>;

/** `POST /v1/focus/start`: a duration or an end time, as in `yoman focus <dur|until HH:MM>`. */
export const FocusStart = z.union([
  z.strictObject({
    profileId: EntityId.optional(),
    minutes: z.int().min(1).max(LIMITS.focusMinutes),
  }),
  z.strictObject({ profileId: EntityId.optional(), until: ClockTime }),
]);
export type FocusStart = z.infer<typeof FocusStart>;

/** What the agent must do to its GNOME settings (SPEC §3 focus start/stop flow). */
export const MuteCommands = z.strictObject({
  mute: AppIdList,
  restore: AppIdList,
});
export type MuteCommands = z.infer<typeof MuteCommands>;

/**
 * The mute decision that rides on an ingest reply (SPEC §3): the commands plus
 * what the agent's muter needs to keep them safe.
 */
export const MuteDirective = MuteCommands.extend({
  /** When the active focus session ends; the muter restores by itself after this. */
  endsAt: Timestamp.optional(),
  /** `Settings.systemApps`: apps that must never be muted. */
  systemApps: AppIdList,
});
export type MuteDirective = z.infer<typeof MuteDirective>;

export const FocusChange = z.strictObject({ state: FocusState, commands: MuteCommands });
export type FocusChange = z.infer<typeof FocusChange>;

export const AlertQueue = z.strictObject({ items: z.array(QueuedAlert).max(LIMITS.listSize) });
export type AlertQueue = z.infer<typeof AlertQueue>;

export const KnownAppSource = z.enum(['desktop', 'gsettings']);
export type KnownAppSource = z.infer<typeof KnownAppSource>;

export const KnownApp = z.strictObject({
  appId: AppId,
  name: Label.nullable(),
  source: KnownAppSource,
  /** Set by the focus service when it lists apps; what makes an app "new". Ignored in a report. */
  firstSeenAt: Timestamp.optional(),
});
export type KnownApp = z.infer<typeof KnownApp>;

export const KnownAppList = z.strictObject({ items: z.array(KnownApp).max(LIMITS.listSize) });
export type KnownAppList = z.infer<typeof KnownAppList>;

/** `POST /v1/focus/known-apps`: the agent's app discovery reports what it found. */
export const KnownAppsReport = KnownAppList;
export type KnownAppsReport = z.infer<typeof KnownAppsReport>;

export const KnownAppsResult = z.strictObject({ added: z.int().min(0).max(LIMITS.listSize) });
export type KnownAppsResult = z.infer<typeof KnownAppsResult>;

export const AlertPolicyEntry = z.strictObject({ type: AlertType, level: AlertLevel });
export type AlertPolicyEntry = z.infer<typeof AlertPolicyEntry>;

export const AlertPolicy = z.strictObject({
  items: z
    .array(AlertPolicyEntry)
    .max(AlertType.options.length)
    .refine((items) => new Set(items.map((i) => i.type)).size === items.length, {
      message: 'each alert type appears once',
    }),
});
export type AlertPolicy = z.infer<typeof AlertPolicy>;
