import { ConflictError, NotFoundError } from '@yoman/service-kit/errors';
import type { Profile, ProfileInput } from '@yoman/shared/focus';
import { LIMITS } from '@yoman/shared/limits';

import type { FocusStore } from './store.js';

/** The list contract holds at most this many profiles, so no more can be created. */
export const MAX_PROFILES = LIMITS.listSize;

export function listProfiles(store: FocusStore): Promise<Profile[]> {
  return store.transaction((tx) => tx.listProfiles(MAX_PROFILES));
}

export function createProfile(store: FocusStore, input: ProfileInput): Promise<Profile> {
  return store.transaction(async (tx) => {
    await tx.lock();
    if ((await tx.countProfiles()) >= MAX_PROFILES) {
      throw new ConflictError('Profile limit reached');
    }
    return tx.createProfile(input);
  });
}

/** A running focus keeps the mutes it started with; the change applies from the next start. */
export function updateProfile(
  store: FocusStore,
  id: string,
  input: ProfileInput,
): Promise<Profile> {
  return store.transaction(async (tx) => {
    await tx.lock();
    const profile = await tx.updateProfile(id, input);
    if (profile === null) {
      throw new NotFoundError('Profile not found');
    }
    return profile;
  });
}

/** The open session's profile cannot be deleted: the state would point at nothing. */
export function deleteProfile(store: FocusStore, id: string): Promise<void> {
  return store.transaction(async (tx) => {
    await tx.lock();
    if ((await tx.openSession())?.profileId === id) {
      throw new ConflictError('Profile is in use by the current focus');
    }
    if (!(await tx.deleteProfile(id))) {
      throw new NotFoundError('Profile not found');
    }
  });
}
