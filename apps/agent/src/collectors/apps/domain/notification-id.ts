import { LIMITS } from '@yoman/shared/limits';
import { z } from 'zod';

/**
 * A GNOME notification ID: the key under
 * `org.gnome.desktop.notifications.application:/…/application/<id>/`.
 * GNOME Shell only ever writes lowercase letters, digits and dashes.
 */
export const NotificationId = z
  .string()
  .regex(/^[a-z0-9-]+$/)
  .max(LIMITS.appIdLength);
export type NotificationId = z.infer<typeof NotificationId>;

const DESKTOP_SUFFIX = /\.desktop$/;
const DISALLOWED = /[^a-z0-9-]/g;
const DASH_RUN = /--+/g;

/**
 * The ID GNOME Shell files an app's notification settings under, computed the
 * way `NotificationApplicationPolicy._canonicalizeId` does from the desktop
 * file ID: `org.gnome.Nautilus.desktop` → `org-gnome-nautilus`. Returns
 * `undefined` when the result would not be a valid ID.
 */
export function toNotificationId(desktopId: string): NotificationId | undefined {
  const canonical = desktopId
    .replace(DESKTOP_SUFFIX, '')
    .toLowerCase()
    .replace(DISALLOWED, '-')
    .replace(DASH_RUN, '-');
  const result = NotificationId.safeParse(canonical);
  return result.success ? result.data : undefined;
}
