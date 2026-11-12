import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import type { BatteryNow } from '@yoman/shared/battery';
import { useTranslation } from 'react-i18next';

import type { GatewayClient } from '../../api/gateway.js';
import { Card } from '../../components/card.js';
import { cyclesPerMonth } from './cycles.js';
import { CyclesChart } from './cycles-chart.js';
import { splitMinutes } from './format.js';
import { HealthTrend } from './health-trend.js';
import { PowerTable } from './power-table.js';
import {
  appsQuery,
  batteryNowQuery,
  healthTrendQuery,
  powerByAppQuery,
  rangeOfDays,
} from './queries.js';
import { RangeSelect } from './range-select.js';
import type { RangeDays } from './search.js';

interface BatteryPageProps {
  /** The router context's gateway client; tests inject a fake. */
  readonly client: GatewayClient;
  /** How many days the charts and the table cover (`?days=`). */
  readonly days: number;
  readonly onDaysChange: (days: RangeDays) => void;
  /** The moment the range ends at. The route passes the current time; tests pin it. */
  readonly now?: Date;
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

/** Battery: how it is now, how it ages, and which apps drain it. */
export function BatteryPage({
  client,
  days,
  onDaysChange,
  now,
}: BatteryPageProps): React.JSX.Element {
  const { t } = useTranslation('battery');
  const current = useQuery(batteryNowQuery(client));
  return (
    <Stack spacing={6}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
        <Typography variant="h1">{t('title')}</Typography>
        <RangeSelect days={days} onChange={onDaysChange} />
      </Box>
      {current.isError ? <Alert severity="error">{t('error')}</Alert> : null}
      {current.isPending ? <Loading /> : null}
      {current.data === null ? <Alert severity="info">{t('noBattery')}</Alert> : null}
      {current.data ? (
        <>
          <Now battery={current.data} />
          <History client={client} days={days} now={now ?? new Date()} />
        </>
      ) : null}
    </Stack>
  );
}

interface HistoryProps {
  readonly client: GatewayClient;
  readonly days: number;
  readonly now: Date;
}

/** The health trend, the cycles per month and the drain table for the chosen range. */
function History({ client, days, now }: HistoryProps): React.JSX.Element {
  const { t } = useTranslation('battery');
  const trend = useQuery(healthTrendQuery(client, days));
  const trendItems = trend.data?.items ?? [];
  return (
    <>
      <Card
        label={t('trend.label')}
        value={
          <Section
            query={trend}
            errorKey="trend.error"
            emptyKey="trend.empty"
            isEmpty={trendItems.length === 0}
          >
            <HealthTrend days={trendItems} />
          </Section>
        }
      />
      {trendItems.length === 0 ? null : (
        <Card
          label={t('cycles.label')}
          value={<CyclesChart months={cyclesPerMonth(trendItems)} />}
        />
      )}
      <Drain client={client} days={days} now={now} />
    </>
  );
}

function Drain({ client, days, now }: HistoryProps): React.JSX.Element {
  const { t } = useTranslation('battery');
  const power = useQuery(powerByAppQuery(client, rangeOfDays(days, now)));
  const apps = useQuery(appsQuery(client));
  return (
    <Card
      label={t('drain.label')}
      context={t('drain.context')}
      value={
        <Section
          query={power}
          errorKey="drain.error"
          emptyKey="drain.empty"
          isEmpty={power.data?.items.length === 0}
        >
          <PowerTable items={power.data?.items ?? []} apps={apps.data?.items ?? []} />
        </Section>
      }
    />
  );
}

interface SectionProps {
  readonly query: { readonly isError: boolean; readonly isPending: boolean };
  readonly errorKey: string;
  readonly emptyKey: string;
  readonly isEmpty: boolean;
  readonly children: React.ReactNode;
}

/** One block's own error, loading and empty states, so a failed section never hides the others. */
function Section({ query, errorKey, emptyKey, isEmpty, children }: SectionProps): React.ReactNode {
  const { t } = useTranslation('battery');
  if (query.isError) {
    return <Alert severity="error">{t(errorKey)}</Alert>;
  }
  if (query.isPending) {
    return <Skeleton aria-busy variant="rounded" height={SKELETON_HEIGHT} />;
  }
  return isEmpty ? <Typography variant="label">{t(emptyKey)}</Typography> : children;
}

function Now({ battery }: { readonly battery: BatteryNow }): React.JSX.Element {
  const { t, i18n } = useTranslation('battery');
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const remaining = battery.minutesRemaining;
  return (
    <Box
      sx={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
    >
      <Card
        size="hero"
        label={t('now.charge')}
        value={t('percent', { value: number.format(Math.round(battery.capacityPct)) })}
        context={t(`status.${battery.status}`)}
      />
      <Card
        label={t('now.remaining')}
        value={remaining === null ? t('now.unknown') : t('duration', splitMinutes(remaining))}
        context={remaining === null ? t('now.remainingNone') : undefined}
      />
      <Card label={t('now.power')} value={t('watts', { value: number.format(battery.powerW) })} />
      <Card
        label={t('now.health')}
        value={t('percent', { value: number.format(battery.healthPct) })}
        context={t('now.healthContext')}
      />
    </Box>
  );
}
