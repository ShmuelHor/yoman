import { useTheme } from '@mui/material/styles';
import { LineChart } from '@mui/x-charts/LineChart';
import type { BatteryDay } from '@yoman/shared/battery';
import { useTranslation } from 'react-i18next';

import { localDay } from './format.js';

interface HealthTrendProps {
  readonly days: readonly BatteryDay[];
}

const CHART_HEIGHT = 260;
const PERCENT_MAX = 100;

/** Battery health (full charge against design capacity) day by day. */
export function HealthTrend({ days }: HealthTrendProps): React.JSX.Element {
  const { t, i18n } = useTranslation('battery');
  const theme = useTheme();
  const date = new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' });
  const percent = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  return (
    <LineChart
      height={CHART_HEIGHT}
      hideLegend
      aria-label={t('trend.label')}
      xAxis={[
        {
          scaleType: 'point',
          data: days.map((day) => localDay(day.date)),
          valueFormatter: (value: Date): string => date.format(value),
        },
      ]}
      yAxis={[{ min: 0, max: PERCENT_MAX, valueFormatter: (v: number): string => `${v}%` }]}
      series={[
        {
          data: days.map((day) => day.healthPct),
          label: t('trend.series'),
          color: theme.vars.palette.tokens.accent,
          showMark: false,
          valueFormatter: (value: number | null): string =>
            value === null ? '' : `${percent.format(value)}%`,
        },
      ]}
      sx={{ '& .MuiLineElement-root': { strokeWidth: theme.chart.strokeWidth } }}
    />
  );
}
