import { AppId } from '@yoman/shared/common';
import { isBuiltInNeverMuted, isSameApp } from '@yoman/shared/never-muted';

export type MutableCheck =
  | { readonly mutable: true }
  | { readonly mutable: false; readonly reason: 'invalid-app-id' | 'system-app' };

/**
 * Decides whether an app may be muted. The app id ends up inside a dconf path
 * handed to `gsettings`, so it is checked here even though the request schema
 * already did: this is the last stop before the process is run.
 * Ids are compared case-insensitively and across the dotted and dashed forms,
 * so the agent refuses a system app even if the gateway asks for it.
 */
export function checkMutable(appId: string, systemApps: readonly string[]): MutableCheck {
  if (!AppId.safeParse(appId).success) {
    return { mutable: false, reason: 'invalid-app-id' };
  }
  const isSystem = isBuiltInNeverMuted(appId) || systemApps.some((app) => isSameApp(app, appId));
  return isSystem ? { mutable: false, reason: 'system-app' } : { mutable: true };
}
