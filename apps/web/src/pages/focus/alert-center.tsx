import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import type { QueuedAlert } from '@yoman/shared/alerts';
import { notificationMessages } from '@yoman/shared/notifications';
import { useTranslation } from 'react-i18next';

import { Tag } from '../../components/tag.js';

interface AlertCenterProps {
  readonly items: readonly QueuedAlert[];
}

/** The alerts that were held back during focus, newest first, in the same words the agent uses. */
export function AlertCenter({ items }: AlertCenterProps): React.JSX.Element {
  const { t, i18n } = useTranslation('focus');
  if (items.length === 0) {
    return <Typography color="text.secondary">{t('queue.empty')}</Typography>;
  }
  const time = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' });
  const newestFirst = [...items].sort((a, b) => b.alert.ts.localeCompare(a.alert.ts));
  return (
    <List aria-label={t('queue.label')} disablePadding>
      {newestFirst.map(({ alert }) => {
        const message = notificationMessages[alert.type];
        return (
          <ListItem key={`${alert.alertKey}:${alert.ts}`} sx={{ gap: 2 }}>
            <ListItemText
              primary={t(message.title)}
              secondary={`${time.format(new Date(alert.ts))} · ${t(message.body, alert.params)}`}
            />
            <Tag variant={alert.level === 'critical' ? 'anomaly' : 'default'}>
              {t(`levels.${alert.level}`)}
            </Tag>
          </ListItem>
        );
      })}
    </List>
  );
}
