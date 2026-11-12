import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { GatewayClient } from '../../api/gateway.js';
import { Card } from '../../components/card.js';
import { CulpritsTable } from './culprits-table.js';
import { dayBounds } from './day.js';
import { DayPicker } from './day-picker.js';
import { IncidentsTable } from './incidents-table.js';
import { PressureChart } from './pressure-chart.js';
import {
  culpritsQuery,
  incidentsQuery,
  rangeOfDays,
  settingsQuery,
  timelineQuery,
} from './queries.js';
import { RangeSelect } from './range-select.js';
import { incidentRegions } from './regions.js';
import type { RangeDays } from './search.js';
import { Thresholds } from './thresholds.js';

interface SystemPageProps {
  /** The router context's gateway client; tests inject a fake. */
  readonly client: GatewayClient;
  /** The day the load chart shows, as `YYYY-MM-DD` (`?date=`). */
  readonly date: string;
  /** How many days the incident history and the culprits cover (`?days=`). */
  readonly days: number;
  readonly onDateChange: (date: string) => void;
  readonly onDaysChange: (days: RangeDays) => void;
  /** The current moment. The route passes the clock; tests pin it. */
  readonly now?: Date;
}

const SKELETON_HEIGHT = 160;

interface SectionProps {
  readonly query: Pick<UseQueryResult, 'isError' | 'isPending'>;
  readonly errorKey: string;
  readonly emptyKey: string;
  readonly isEmpty: boolean;
  readonly children: React.ReactNode;
}

/** One block's own error, loading and empty states, so a failed request never hides the others. */
function Section({ query, errorKey, emptyKey, isEmpty, children }: SectionProps): React.ReactNode {
  const { t } = useTranslation('system');
  if (query.isError) {
    return <Alert severity="error">{t(errorKey)}</Alert>;
  }
  if (query.isPending) {
    return <Skeleton aria-busy variant="rounded" height={SKELETON_HEIGHT} />;
  }
  return isEmpty ? <Typography variant="label">{t(emptyKey)}</Typography> : children;
}

/** System: the day's load chart, incident history, recurring culprits and thresholds. */
export function SystemPage({
  client,
  date,
  days,
  onDateChange,
  onDaysChange,
  now,
}: SystemPageProps): React.JSX.Element {
  const { t } = useTranslation('system');
  const clock = now ?? new Date();
  return (
    <Stack spacing={6}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
        <Typography variant="h1">{t('title')}</Typography>
        <RangeSelect days={days} onChange={onDaysChange} />
      </Box>
      <LoadChart client={client} date={date} now={clock} onDateChange={onDateChange} />
      <Incidents client={client} days={days} now={clock} />
      <Culprits client={client} days={days} />
      <ThresholdsCard client={client} />
    </Stack>
  );
}

interface LoadChartProps {
  readonly client: GatewayClient;
  readonly date: string;
  readonly now: Date;
  readonly onDateChange: (date: string) => void;
}

function LoadChart({ client, date, now, onDateChange }: LoadChartProps): React.JSX.Element {
  const { t } = useTranslation('system');
  const timeline = useQuery(timelineQuery(client, date));
  const bounds = dayBounds(date);
  const points = timeline.data?.points ?? [];
  return (
    <Card
      label={t('chart.label')}
      context={t('chart.context')}
      value={
        <Stack spacing={3}>
          <DayPicker date={date} now={now} onChange={onDateChange} />
          <Section
            query={timeline}
            errorKey="chart.error"
            emptyKey="chart.empty"
            isEmpty={points.length === 0}
          >
            <PressureChart
              points={points}
              bounds={bounds}
              regions={incidentRegions(timeline.data?.incidents ?? [], bounds, now)}
            />
          </Section>
        </Stack>
      }
    />
  );
}

function Incidents({
  client,
  days,
  now,
}: {
  readonly client: GatewayClient;
  readonly days: number;
  readonly now: Date;
}): React.JSX.Element {
  const { t } = useTranslation('system');
  const incidents = useQuery(incidentsQuery(client, rangeOfDays(days, now)));
  return (
    <Card
      label={t('incidents.label')}
      value={
        <Section
          query={incidents}
          errorKey="incidents.error"
          emptyKey="incidents.empty"
          isEmpty={incidents.data?.items.length === 0}
        >
          <IncidentsTable incidents={incidents.data?.items ?? []} now={now} />
        </Section>
      }
    />
  );
}

function Culprits({
  client,
  days,
}: {
  readonly client: GatewayClient;
  readonly days: number;
}): React.JSX.Element {
  const { t } = useTranslation('system');
  const culprits = useQuery(culpritsQuery(client, days));
  return (
    <Card
      label={t('culprits.label')}
      context={t('culprits.context')}
      value={
        <Section
          query={culprits}
          errorKey="culprits.error"
          emptyKey="culprits.empty"
          isEmpty={culprits.data?.items.length === 0}
        >
          <CulpritsTable culprits={culprits.data?.items ?? []} />
        </Section>
      }
    />
  );
}

function ThresholdsCard({ client }: { readonly client: GatewayClient }): React.JSX.Element {
  const { t } = useTranslation('system');
  const settings = useQuery(settingsQuery(client));
  return (
    <Card
      label={t('thresholds.label')}
      value={
        <Section
          query={settings}
          errorKey="thresholds.error"
          emptyKey="thresholds.error"
          isEmpty={false}
        >
          {settings.data === undefined ? null : (
            <Thresholds thresholds={settings.data.thresholds} />
          )}
        </Section>
      }
    />
  );
}
