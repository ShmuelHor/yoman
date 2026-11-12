import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { useTranslation } from 'react-i18next';

import type { MonthlyCycles } from './cycles.js';
import { localDay } from './format.js';

interface CyclesChartProps {
  readonly months: readonly MonthlyCycles[];
}

const CHART_HEIGHT = 220;

/** Charge cycles used in each month. */
export function CyclesChart({ months }: CyclesChartProps): React.JSX.Element {
  const { t, i18n } = useTranslation('battery');
  const theme = useTheme();
  const month = new Intl.DateTimeFormat(i18n.language, { month: 'short', year: '2-digit' });
  return (
    <BarChart
      height={CHART_HEIGHT}
      hideLegend
      aria-label={t('cycles.label')}
      xAxis={[
        {
          scaleType: 'band',
          data: months.map((entry) => localDay(`${entry.month}-01`)),
          valueFormatter: (value: Date): string => month.format(value),
        },
      ]}
      series={[
        {
          data: months.map((entry) => entry.cycles),
          label: t('cycles.series'),
          color: theme.vars.palette.tokens.catComms,
        },
      ]}
      borderRadius={theme.shape.radiusSm}
    />
  );
}
