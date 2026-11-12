import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Settings } from '@yoman/shared/settings';

import type { GatewayClient } from '../../api/gateway.js';

/** Saves every setting at once and announces it with a toast (`meta.successMessage`). */
export function useSaveSettings(
  client: GatewayClient,
): UseMutationResult<Settings, Error, Settings> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Settings) => client.request('updateSettings', { body }),
    meta: { successMessage: 'settings:toast.saved' },
    onSuccess: (saved): void => {
      queryClient.setQueryData(['getSettings'], saved);
    },
  });
}
