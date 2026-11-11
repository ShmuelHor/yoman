import type { AppId } from '@yoman/shared/common';
import type { FocusState, MuteDirective, Profile } from '@yoman/shared/focus';

/**
 * What the agent's muter should hold right now. While a focus session is
 * active the profile's muted apps are muted; with none, nothing is, and the
 * agent restores whatever it had muted. Apps on the system list are never
 * muted, and a profile's exceptions keep notifying.
 *
 * TODO(T30): apps found by "mute new apps" come from the focus service's own
 * mute plan; until focus exposes it, only the profile's explicit list is sent.
 */
export function buildMuteDirective(
  state: FocusState,
  profiles: readonly Profile[],
  systemApps: readonly AppId[],
): MuteDirective {
  if (!state.active) {
    return { mute: [], restore: [], systemApps: [...systemApps] };
  }
  const profile = profiles.find((candidate) => candidate.id === state.profileId);
  const blocked = new Set<string>([...systemApps, ...(profile?.exceptions ?? [])]);
  const mute = (profile?.mutedApps ?? []).filter((app) => !blocked.has(app));
  return { mute, restore: [], endsAt: state.endsAt, systemApps: [...systemApps] };
}
