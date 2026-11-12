import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import type { KnownApp } from '@yoman/shared/focus';
import { useTranslation } from 'react-i18next';

import { Tag } from '../../components/tag.js';

interface KnownAppsProps {
  readonly apps: readonly KnownApp[];
  /** App ids no profile mentions yet. */
  readonly fresh: ReadonlySet<string>;
}

/** The apps the agent found on the desktop; the ones no profile covers yet are tagged "new". */
export function KnownApps({ apps, fresh }: KnownAppsProps): React.JSX.Element {
  const { t } = useTranslation('focus');
  if (apps.length === 0) {
    return <Typography color="text.secondary">{t('apps.empty')}</Typography>;
  }
  return (
    <List aria-label={t('apps.label')} disablePadding>
      {apps.map((app) => (
        <ListItem key={app.appId} sx={{ gap: 2 }}>
          <span>{app.name ?? app.appId}</span>
          {fresh.has(app.appId) ? <Tag variant="anomaly">{t('newTag')}</Tag> : null}
        </ListItem>
      ))}
    </List>
  );
}
