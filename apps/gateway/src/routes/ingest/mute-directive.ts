import type { AppId } from '@yoman/shared/common';
import type { FocusState, MuteDirective, Profile } from '@yoman/shared/focus';
import { LIMITS } from '@yoman/shared/limits';

/**
 * What the agent's muter should hold right now. While a focus session is
 * active the profile's muted apps are muted; with none, nothing is, and the
 * agent restores whatever it had muted. Apps on the system list are never
 * muted, and a profile's exceptions keep notifying.
 *
 * With `muteNewApps`, every known app the profile does not list is muted too,
 * so an app installed after the profile was written is muted by default. This
 * is the same rule as the focus service's mute plan, applied to the apps the
 * agent has reported, so the commands here match what a start returned.
 */
export function buildMuteDirective(
  state: FocusState,
  profiles: readonly Profile[],
  systemApps: readonly AppId[],
  knownApps: readonly AppId[] = [],
): MuteDirective {
  if (!state.active) {
    return { mute: [], restore: [], systemApps: [...systemApps] };
  }
  const profile = profiles.find((candidate) => candidate.id === state.profileId);
  const blocked = new Set<string>([...systemApps, ...(profile?.exceptions ?? [])]);
  const candidates = [
    ...(profile?.mutedApps ?? []),
    ...(profile?.muteNewApps === true ? knownApps : []),
  ];
  const mute = [...new Set(candidates)]
    .filter((app) => !blocked.has(app))
    .sort()
    .slice(0, LIMITS.listSize);
  return { mute, restore: [], endsAt: state.endsAt, systemApps: [...systemApps] };
}
