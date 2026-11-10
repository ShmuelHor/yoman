import { AppId } from '@yoman/shared/common';

/** Apps that are never muted, whatever the profile or the settings say (SPEC §4.2). */
const NEVER_MUTED_EXACT: ReadonlySet<string> = new Set(['update-manager', 'yoman']);
const NEVER_MUTED_PREFIXES = ['gnome-', 'org.gnome.'] as const;

export type MutableCheck =
  | { readonly mutable: true }
  | { readonly mutable: false; readonly reason: 'invalid-app-id' | 'system-app' };

/**
 * Decides whether an app may be muted. The app id ends up inside a dconf path
 * handed to `gsettings`, so it is checked here even though the request schema
 * already did: this is the last stop before the process is run.
 * Ids are compared case-insensitively, because desktop ids differ in case
 * between packages.
 */
export function checkMutable(appId: string, systemApps: readonly string[]): MutableCheck {
  if (!AppId.safeParse(appId).success) {
    return { mutable: false, reason: 'invalid-app-id' };
  }
  const id = appId.toLowerCase();
  const isSystem =
    NEVER_MUTED_EXACT.has(id) ||
    NEVER_MUTED_PREFIXES.some((prefix) => id.startsWith(prefix)) ||
    systemApps.some((systemApp) => systemApp.toLowerCase() === id);
  return isSystem ? { mutable: false, reason: 'system-app' } : { mutable: true };
}
