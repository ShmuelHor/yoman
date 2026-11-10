import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { AppTotal } from '@yoman/shared/reports';

import type { App } from '@yoman/shared/sessions';
import { useTranslation } from 'react-i18next';
import { splitDuration } from './format.js';

interface TopAppsProps {
  readonly topApps: readonly AppTotal[];
  readonly apps: readonly App[];
}

/**
 * The most used apps. The display name comes from the user's app list and is
 * untrusted (SECURITY A6): it is only ever a React text child, never HTML.
 */
export function TopApps({ topApps, apps }: TopAppsProps): React.JSX.Element {
  const { t } = useTranslation('today');
  const nameOf = (appId: string): string => apps.find((app) => app.id === appId)?.name ?? appId;
  return (
    <Box
      component="ol"
      sx={{
        margin: 0,
        padding: 0,
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {topApps.map((app) => (
        <Box
          key={app.appId}
          component="li"
          sx={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}
        >
          <Typography>{nameOf(app.appId)}</Typography>
          <Typography variant="table">{t('duration', splitDuration(app.seconds))}</Typography>
        </Box>
      ))}
    </Box>
  );
}
