import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { GatewayClient } from '../../api/gateway.js';
import { useSaveSettings } from './mutations.js';
import { settingsQuery } from './queries.js';
import { SettingsFormView } from './settings-form-view.js';

interface SettingsPageProps {
  /** The router context's gateway client; tests inject a fake. */
  readonly client: GatewayClient;
}

const SKELETON_HEIGHT = 320;

/** Settings: language, color theme, privacy, thresholds, system apps and quiet hours. */
export function SettingsPage({ client }: SettingsPageProps): React.JSX.Element {
  const { t } = useTranslation('settings');
  const settings = useQuery(settingsQuery(client));
  const save = useSaveSettings(client);

  return (
    <Stack spacing={6}>
      <Typography variant="h1">{t('title')}</Typography>
      {settings.isError ? <Alert severity="error">{t('error')}</Alert> : null}
      {settings.isPending ? (
        <Skeleton aria-busy variant="rounded" height={SKELETON_HEIGHT} />
      ) : null}
      {settings.data === undefined ? null : (
        <SettingsFormView
          settings={settings.data}
          saving={save.isPending}
          onSave={(body): void => save.mutate(body)}
        />
      )}
    </Stack>
  );
}
