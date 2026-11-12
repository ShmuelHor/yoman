import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AlertPolicy,
  FocusChange,
  FocusStart,
  Profile,
  ProfileInput,
} from '@yoman/shared/focus';

import type { GatewayClient } from '../../api/gateway.js';

/** Starting or stopping focus changes the state and what is queued. */
const FOCUS_QUERIES = ['focusState', 'focusQueue'] as const;

interface ProfileUpdate {
  readonly id: string;
  readonly body: ProfileInput;
}

export interface FocusMutations {
  readonly startFocus: UseMutationResult<FocusChange, Error, FocusStart>;
  readonly stopFocus: UseMutationResult<FocusChange, Error, void>;
  readonly createProfile: UseMutationResult<Profile, Error, ProfileInput>;
  readonly updateProfile: UseMutationResult<Profile, Error, ProfileUpdate>;
  readonly deleteProfile: UseMutationResult<undefined, Error, string>;
  readonly updateAlertPolicy: UseMutationResult<AlertPolicy, Error, AlertPolicy>;
}

/** Every write of the Focus page. Each one announces its success with a toast (`meta.successMessage`). */
export function useFocusMutations(client: GatewayClient): FocusMutations {
  const queryClient = useQueryClient();
  const refresh = (keys: readonly string[]) => async (): Promise<void> => {
    await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
  };

  const startFocus = useMutation({
    mutationFn: (body: FocusStart) => client.request('focusStart', { body }),
    meta: { successMessage: 'focus:toast.started' },
    onSuccess: refresh(FOCUS_QUERIES),
  });
  const stopFocus = useMutation({
    mutationFn: () => client.request('focusStop'),
    meta: { successMessage: 'focus:toast.stopped' },
    onSuccess: refresh(FOCUS_QUERIES),
  });
  const createProfile = useMutation({
    mutationFn: (body: ProfileInput) => client.request('createProfile', { body }),
    meta: { successMessage: 'focus:toast.profileCreated' },
    onSuccess: refresh(['listProfiles']),
  });
  const updateProfile = useMutation({
    mutationFn: ({ id, body }: ProfileUpdate) =>
      client.request('updateProfile', { params: { id }, body }),
    meta: { successMessage: 'focus:toast.profileSaved' },
    onSuccess: refresh(['listProfiles']),
  });
  const deleteProfile = useMutation({
    mutationFn: (id: string) => client.request('deleteProfile', { params: { id } }),
    meta: { successMessage: 'focus:toast.profileDeleted' },
    onSuccess: refresh(['listProfiles', 'focusState']),
  });
  const updateAlertPolicy = useMutation({
    mutationFn: (body: AlertPolicy) => client.request('updateAlertPolicy', { body }),
    meta: { successMessage: 'focus:toast.policySaved' },
    onSuccess: refresh(['getAlertPolicy']),
  });
  return {
    startFocus,
    stopFocus,
    createProfile,
    updateProfile,
    deleteProfile,
    updateAlertPolicy,
  };
}
