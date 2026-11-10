import { KnownApp } from '@yoman/shared/focus';
import type { DesktopEntry } from './desktop-entry.js';
import { type NotificationId, toNotificationId } from './notification-id.js';

/** One applications directory: desktop file ID → its parsed entry. */
export type DirectoryListing = ReadonlyMap<string, DesktopEntry>;

/**
 * Builds the known-app catalog GNOME notification settings apply to.
 *
 * `directories` come in XDG precedence order, so the first directory that has
 * a desktop file ID decides it, and a deleted (`Hidden`) user copy hides the
 * system one. Every desktop file is its own app: a Chrome web app
 * (`chrome-<id>-Default.desktop`) is listed apart from Chrome itself.
 * `children` are apps GNOME has seen notify; one without a desktop file is
 * still listed, without a name.
 */
export function buildKnownApps(
  directories: readonly DirectoryListing[],
  children: readonly NotificationId[],
): KnownApp[] {
  const decided = new Set<string>();
  const apps = new Map<NotificationId, KnownApp>();
  for (const listing of directories) {
    for (const [desktopId, entry] of listing) {
      if (decided.has(desktopId)) {
        continue;
      }
      decided.add(desktopId);
      const appId = toNotificationId(desktopId);
      if (entry.status === 'app' && appId !== undefined && !apps.has(appId)) {
        apps.set(appId, KnownApp.parse({ appId, name: entry.name, source: 'desktop' }));
      }
    }
  }
  for (const appId of children) {
    if (!apps.has(appId)) {
      apps.set(appId, KnownApp.parse({ appId, name: null, source: 'gsettings' }));
    }
  }
  // A plain code-unit order, so the result does not depend on the host locale.
  return [...apps.values()].sort((a, b) => (a.appId < b.appId ? -1 : 1));
}

/** The apps in `next` that `previous` did not have. */
export function newApps(previous: readonly KnownApp[], next: readonly KnownApp[]): KnownApp[] {
  const known = new Set(previous.map((app) => app.appId));
  return next.filter((app) => !known.has(app.appId));
}
