import type { KnownApp, KnownAppsReport } from '@yoman/shared/focus';
import { LIMITS } from '@yoman/shared/limits';

import type { FocusStore } from './store.js';

/** The list contract holds at most this many apps; discoveries beyond it are ignored. */
export const MAX_KNOWN_APPS = LIMITS.listSize;

export function listKnownApps(store: FocusStore): Promise<KnownApp[]> {
  return store.transaction((tx) => tx.listKnownApps(MAX_KNOWN_APPS));
}

/**
 * Records what the agent's discovery found. Known apps are refreshed; new
 * ones are added while there is room. An app reported twice counts once,
 * with its last entry.
 */
export function reportKnownApps(store: FocusStore, report: KnownAppsReport): Promise<number> {
  return store.transaction(async (tx) => {
    await tx.lock();
    const known = new Set((await tx.listKnownApps(MAX_KNOWN_APPS)).map((app) => app.appId));
    const reported = [...new Map(report.items.map((app) => [app.appId, app])).values()];
    const fresh = reported.filter((app) => !known.has(app.appId));
    const room = Math.max(0, MAX_KNOWN_APPS - known.size);
    const accepted = [...reported.filter((app) => known.has(app.appId)), ...fresh.slice(0, room)];
    return tx.saveKnownApps(accepted);
  });
}
