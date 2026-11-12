import type { AppId } from '@yoman/shared/common';
import type { FocusState, MuteDirective, Profile } from '@yoman/shared/focus';
import { LIMITS } from '@yoman/shared/limits';

import { isNeverMuted } from '../../core/never-muted.js';

/**
 * What the agent's muter should hold right now. While a focus session is
 * active the profile's muted apps are muted; with none, nothing is, and the
 * agent restores whatever it had muted. Apps on the system list are never
 * muted, and a profile's exceptions keep notifying.
 *
 * With `muteNewApps`, the new apps are muted too: those first seen after the
 * first known-apps sync, never the first catalog. This is the same rule as the
 * focus service's mute plan, so the commands here match what a start returned.
 */
export function buildMuteDirective(
  state: FocusState,
  profiles: readonly Profile[],
  systemApps: readonly AppId[],
  newApps: readonly AppId[] = [],
): MuteDirective {
  if (!state.active) {
    return { mute: [], restore: [], systemApps: [...systemApps] };
  }
  const profile = profiles.find((candidate) => candidate.id === state.profileId);
  const exceptions = new Set<string>(profile?.exceptions ?? []);
  const candidates = [
    ...(profile?.mutedApps ?? []),
    ...(profile?.muteNewApps === true ? newApps : []),
  ];
  const mute = [...new Set(candidates)]
    // Before the cap, so a system app never takes the place of a real one.
    .filter((app) => !exceptions.has(app) && !isNeverMuted(app, systemApps))
    .sort()
    .slice(0, LIMITS.listSize);
  return { mute, restore: [], endsAt: state.endsAt, systemApps: [...systemApps] };
}
