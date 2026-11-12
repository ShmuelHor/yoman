import type { AppId } from './common.js';
import type { KnownApp } from './focus.js';

/**
 * The apps "mute new apps" may mute: those first seen after the first
 * known-apps sync. The first catalog is stored in one statement, so all of its
 * apps share the earliest `firstSeenAt` and none of them counts as new. An app
 * without a `firstSeenAt` is not new, so unsure means not muted.
 */
export function appsFirstSeenAfterFirstSync(apps: readonly KnownApp[]): AppId[] {
  const times = apps.flatMap((app) =>
    app.firstSeenAt === undefined ? [] : [Date.parse(app.firstSeenAt)],
  );
  if (times.length === 0) {
    return [];
  }
  const firstSync = Math.min(...times);
  return apps
    .filter((app) => app.firstSeenAt !== undefined && Date.parse(app.firstSeenAt) > firstSync)
    .map((app) => app.appId);
}
