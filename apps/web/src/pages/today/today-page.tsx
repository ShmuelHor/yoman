import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import type { DashboardToday } from '@yoman/shared/gateway';
import type { App } from '@yoman/shared/sessions';
import { useTranslation } from 'react-i18next';

import { createGatewayClient, type GatewayClient } from '../../api/gateway.js';
import { Card } from '../../components/card.js';
import { splitDuration } from './format.js';
import { appsQuery, todayQuery } from './queries.js';
import { Timeline } from './timeline.js';
import { TopApps } from './top-apps.js';

let defaultClient: GatewayClient | undefined;

/** One client per page load, created on first use so importing the page has no side effects. */
function gatewayClient(): GatewayClient {
  defaultClient ??= createGatewayClient(window.location);
  return defaultClient;
}

interface TodayPageProps {
  /** Injected by tests; the app uses the gateway on the page's own host. */
  readonly client?: GatewayClient;
}

const SKELETON_HEIGHT = 96;

function Loading(): React.JSX.Element {
  return (
    <Box
      aria-busy
      sx={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
    >
      {[0, 1, 2].map((slot) => (
        <Skeleton key={slot} variant="rounded" height={SKELETON_HEIGHT} />
      ))}
    </Box>
  );
}

/** The Today dashboard: active time, focus streak, battery, timeline and top apps. */
export function TodayPage({ client = gatewayClient() }: TodayPageProps): React.JSX.Element {
  const { t } = useTranslation('today');
  const today = useQuery(todayQuery(client));
  const apps = useQuery(appsQuery(client));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Typography variant="h1">{t('title')}</Typography>
      {today.isPending ? <Loading /> : null}
      {today.isError ? <Alert severity="error">{t('error')}</Alert> : null}
      {today.data === undefined ? null : (
        <Dashboard today={today.data} apps={apps.data?.items ?? []} />
      )}
    </Box>
  );
}

interface DashboardProps {
  readonly today: DashboardToday;
  readonly apps: readonly App[];
}

/** A section whose service is down shows a note instead of a number (SPEC §5 degraded). */
function Unavailable(): React.JSX.Element {
  const { t } = useTranslation('today');
  return <Typography variant="label">{t('unavailable')}</Typography>;
}

function Dashboard({ today, apps }: DashboardProps): React.JSX.Element {
  const { t } = useTranslation('today');
  const { reports, battery } = today.data;
  return (
    <>
      {today.degraded.length > 0 ? <Alert severity="warning">{t('degraded')}</Alert> : null}
      <Box
        sx={{
          display: 'grid',
          gap: 4,
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        }}
      >
        <Card
          size="hero"
          label={t('active.label')}
          value={
            reports === null ? <Unavailable /> : t('duration', splitDuration(reports.totalSeconds))
          }
        />
        <Card
          label={t('streak.label')}
          value={
            reports === null ? (
              <Unavailable />
            ) : (
              t('duration', splitDuration(reports.longestFocusStreakSeconds))
            )
          }
        />
        <Card
          label={t('battery.label')}
          value={
            battery === null ? (
              <Unavailable />
            ) : (
              t('battery.value', { percent: Math.round(battery.capacityPct) })
            )
          }
          context={battery === null ? undefined : t(`battery.status.${battery.status}`)}
        />
      </Box>
      {reports === null ? null : (
        <>
          <Card label={t('timeline.label')} value={<Timeline byCategory={reports.byCategory} />} />
          <Card
            label={t('topApps.label')}
            value={<TopApps topApps={reports.topApps} apps={apps} />}
          />
        </>
      )}
    </>
  );
}
