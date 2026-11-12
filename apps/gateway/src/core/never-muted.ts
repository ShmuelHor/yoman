import type { AppId } from '@yoman/shared/common';
import type { FocusChange } from '@yoman/shared/focus';

/** SPEC §4.2 "Never muted": `gnome-*`, `org.gnome.*`, `update-manager` and `yoman`. */
const NEVER_MUTED_PREFIXES = ['gnome-', 'org.gnome.'];
const NEVER_MUTED_NAMES: ReadonlySet<string> = new Set(['update-manager', 'yoman']);

/**
 * True for an app that must never be muted: the built-in system apps, and
 * every app on the user's system list. Compared case-insensitively, so
 * `ORG.GNOME.Shell` is no way round the rule.
 */
export function isNeverMuted(app: AppId, systemApps: readonly AppId[]): boolean {
  const name = app.toLowerCase();
  return (
    NEVER_MUTED_NAMES.has(name) ||
    NEVER_MUTED_PREFIXES.some((prefix) => name.startsWith(prefix)) ||
    systemApps.some((system) => system.toLowerCase() === name)
  );
}

/** A focus change without mute commands for never-muted apps. Restores stay: restoring is harmless. */
export function withoutNeverMuted(change: FocusChange, systemApps: readonly AppId[]): FocusChange {
  return {
    ...change,
    commands: {
      ...change.commands,
      mute: change.commands.mute.filter((app) => !isNeverMuted(app, systemApps)),
    },
  };
}
