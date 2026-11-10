import { z } from 'zod';

/** The largest D-Bus `u` (uint32). */
const MAX_UINT32 = 0xffff_ffff;
/** Our action keys (`default`, `open-dashboard`) are short; anything longer is not ours. */
const MAX_ACTION_KEY_LENGTH = 64;

/** A D-Bus `u`. The server never hands out 0, which means "no notification". */
const NotificationId = z.int().min(1).max(MAX_UINT32);
const ActionKey = z.string().max(MAX_ACTION_KEY_LENGTH);

const NotifyReply = z.tuple([NotificationId]);
const ActionInvoked = z.tuple([NotificationId, ActionKey]);
/** `NotificationClosed (u id, u reason)`. */
const NotificationClosed = z.tuple([NotificationId, z.int().min(0).max(MAX_UINT32)]);

export interface InvokedAction {
  readonly id: number;
  readonly action: string;
}

/** The id `Notify` returned, or `undefined` for a reply of the wrong shape. */
export function parseNotifyReply(body: readonly unknown[]): number | undefined {
  const result = NotifyReply.safeParse(body);
  return result.success ? result.data[0] : undefined;
}

/** An `ActionInvoked` signal, or `undefined` for a payload of the wrong shape. */
export function parseActionInvoked(body: readonly unknown[]): InvokedAction | undefined {
  const result = ActionInvoked.safeParse(body);
  return result.success ? { id: result.data[0], action: result.data[1] } : undefined;
}

/** The closed notification's id, or `undefined` for a payload of the wrong shape. */
export function parseNotificationClosed(body: readonly unknown[]): number | undefined {
  const result = NotificationClosed.safeParse(body);
  return result.success ? result.data[0] : undefined;
}
