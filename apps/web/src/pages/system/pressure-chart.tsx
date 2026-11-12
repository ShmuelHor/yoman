import { useTheme } from '@mui/material/styles';
import { useDrawingArea, useXScale } from '@mui/x-charts/hooks';
import { LineChart } from '@mui/x-charts/LineChart';
import type { PressurePoint } from '@yoman/shared/system';
import { useTranslation } from 'react-i18next';

import type { Region } from './regions.js';

interface PressureChartProps {
  readonly points: readonly PressurePoint[];
  readonly regions: readonly Region[];
  /** The first and last moment of the day: the axis always shows the whole day. */
  readonly bounds: { readonly start: Date; readonly end: Date };
}

const CHART_HEIGHT = 280;
const PERCENT_MAX = 100;

/** Incident stretches behind the lines, in the accent at the design's anomaly opacity (DESIGN.md rule 5). */
function IncidentRegions({ regions }: { readonly regions: readonly Region[] }): React.JSX.Element {
  const theme = useTheme();
  const scale = useXScale<'time'>();
  const { top, height } = useDrawingArea();
  return (
    <g aria-hidden>
      {regions.map((region) => {
        const x = scale(region.start);
        return (
          <rect
            key={region.id}
            x={x}
            y={top}
            width={Math.max(scale(region.end) - x, 1)}
            height={height}
            fill={theme.vars.palette.tokens.accent}
            fillOpacity={theme.chart.anomalyOpacity}
          />
        );
      })}
    </g>
  );
}

/** CPU, memory and IO pressure (`some avg10`) across one day, with incidents shaded. */
export function PressureChart({ points, regions, bounds }: PressureChartProps): React.JSX.Element {
  const { t, i18n } = useTranslation('system');
  const theme = useTheme();
  const time = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const percent = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const { tokens } = theme.vars.palette;
  const line = (
    label: string,
    color: string,
    pick: (point: PressurePoint) => number,
  ): {
    data: number[];
    label: string;
    color: string;
    showMark: false;
    valueFormatter: (value: number | null) => string;
  } => ({
    data: points.map(pick),
    label,
    color,
    showMark: false,
    valueFormatter: (value) => (value === null ? '' : `${percent.format(value)}%`),
  });
  return (
    <LineChart
      height={CHART_HEIGHT}
      aria-label={t('chart.label')}
      xAxis={[
        {
          scaleType: 'time',
          data: points.map((point) => new Date(point.ts)),
          min: bounds.start,
          max: bounds.end,
          valueFormatter: (value: Date): string => time.format(value),
        },
      ]}
      yAxis={[{ min: 0, max: PERCENT_MAX, valueFormatter: (v: number): string => `${v}%` }]}
      series={[
        line(t('metric.cpu'), tokens.catWork, (point) => point.cpu),
        line(t('metric.memory'), tokens.catComms, (point) => point.memory),
        line(t('metric.io'), tokens.catFun, (point) => point.io),
      ]}
      sx={{ '& .MuiLineElement-root': { strokeWidth: theme.chart.strokeWidth } }}
    >
      <IncidentRegions regions={regions} />
    </LineChart>
  );
}
