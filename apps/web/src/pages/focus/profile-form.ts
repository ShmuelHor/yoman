import { type Profile, ProfileInput } from '@yoman/shared/focus';

/** The profile as the form edits it: the same fields as the contract, validated by its schema. */
export const ProfileForm = ProfileInput;
export type ProfileForm = ProfileInput;

/** A new profile mutes nothing yet, and keeps muting apps that appear later. */
export const NEW_PROFILE_FORM: ProfileForm = {
  name: '',
  mutedApps: [],
  exceptions: [],
  muteNewApps: true,
};

/** The form values of an existing profile. */
export function profileToForm(profile: Profile): ProfileForm {
  return {
    name: profile.name,
    mutedApps: [...profile.mutedApps],
    exceptions: [...profile.exceptions],
    muteNewApps: profile.muteNewApps,
  };
}

/**
 * The app ids a profile can choose from: every app the agent discovered plus
 * any the profile already lists, so an app that is no longer installed can still be unticked.
 */
export function selectableApps(
  known: readonly { readonly appId: string }[],
  form: Pick<ProfileForm, 'mutedApps' | 'exceptions'>,
): string[] {
  const ids = new Set([...known.map((app) => app.appId), ...form.mutedApps, ...form.exceptions]);
  return [...ids].sort((a, b) => a.localeCompare(b));
}

/**
 * Apps the agent discovered that no profile mentions yet: the "new" tag on
 * the Focus page. They are muted by profiles with `muteNewApps` until the user decides.
 */
export function newAppIds(
  known: readonly { readonly appId: string }[],
  profiles: readonly Profile[],
): Set<string> {
  const mentioned = new Set(profiles.flatMap((p) => [...p.mutedApps, ...p.exceptions]));
  return new Set(known.map((app) => app.appId).filter((id) => !mentioned.has(id)));
}

/** The label of an app: its discovered name (untrusted, shown as text) or its id. */
export function appLabel(
  known: readonly { readonly appId: string; readonly name: string | null }[],
  appId: string,
): string {
  return known.find((app) => app.appId === appId)?.name ?? appId;
}
