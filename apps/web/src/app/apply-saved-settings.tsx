import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { GatewayClient } from '../api/gateway.js';
import { settingsQuery } from '../pages/settings/queries.js';
import { useTheme } from '../theme/theme-provider.js';

interface ApplySavedSettingsProps {
  readonly client: GatewayClient;
}

/**
 * Applies the saved language and theme once, when the settings first load. If
 * the gateway is down nothing happens and the defaults stay. Later changes are
 * the user's own (the shell pickers or the Settings page), so they are never
 * overwritten by a refetch.
 */
export function ApplySavedSettings({ client }: ApplySavedSettingsProps): null {
  const { i18n } = useTranslation();
  const { setPreference } = useTheme();
  const { data } = useQuery(settingsQuery(client));
  const applied = useRef(false);

  useEffect(() => {
    if (data === undefined || applied.current) {
      return;
    }
    applied.current = true;
    void i18n.changeLanguage(data.language);
    setPreference(data.theme);
  }, [data, i18n, setPreference]);

  return null;
}
