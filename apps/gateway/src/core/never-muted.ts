import type { AppId } from '@yoman/shared/common';
import type { FocusChange } from '@yoman/shared/focus';
import { isBuiltInNeverMuted, isSameApp } from '@yoman/shared/never-muted';

/**
 * True for an app that must never be muted: the built-in system apps (SPEC
 * §4.2, matched in both the dotted and the dashed ID form), and every app on
 * the user's system list. Compared case-insensitively and across the two ID
 * forms, so `ORG.GNOME.Shell` and `org-gnome-shell` are no way round the rule.
 */
export function isNeverMuted(app: AppId, systemApps: readonly AppId[]): boolean {
  return isBuiltInNeverMuted(app) || systemApps.some((system) => isSameApp(system, app));
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
