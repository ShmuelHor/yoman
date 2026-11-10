import { LIMITS } from '@yoman/shared/limits';

/** What a profile decides about muting. */
export interface MuteProfile {
  readonly mutedApps: readonly string[];
  readonly exceptions: readonly string[];
  readonly muteNewApps: boolean;
}

/** The commands the agent carries out, as in `MuteCommands`. */
export interface MutePlan {
  readonly mute: string[];
  readonly restore: string[];
}

function sorted(apps: Iterable<string>): string[] {
  return [...new Set(apps)].sort();
}

/**
 * The apps a focus with this profile mutes. Exceptions always keep notifying.
 * With `muteNewApps`, every known app the profile does not list is muted too,
 * so an app installed after the profile was written is muted by default. The
 * result is sorted and capped at the contract's list size.
 */
export function appsToMute(profile: MuteProfile, knownApps: readonly string[]): string[] {
  const exceptions = new Set(profile.exceptions);
  const candidates = profile.muteNewApps ? [...profile.mutedApps, ...knownApps] : profile.mutedApps;
  return sorted(candidates.filter((app) => !exceptions.has(app))).slice(0, LIMITS.listSize);
}

/**
 * Moving from one muted set to another: mute the new set, and restore only
 * the apps the new set no longer covers, so an app muted in both never
 * flickers back on. Stopping is a move to the empty set.
 */
export function switchMutes(previous: readonly string[], next: readonly string[]): MutePlan {
  const kept = new Set(next);
  return { mute: sorted(next), restore: sorted(previous.filter((app) => !kept.has(app))) };
}
