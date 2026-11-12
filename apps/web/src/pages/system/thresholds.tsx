import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Settings } from '@yoman/shared/settings';
import { useTranslation } from 'react-i18next';

interface ThresholdsProps {
  readonly thresholds: Settings['thresholds'];
}

const METRICS = ['cpu', 'memory', 'io'] as const;

/**
 * The `some avg10` levels above which an incident opens. Read-only here: they
 * are edited on the Settings page (T41).
 */
export function Thresholds({ thresholds }: ThresholdsProps): React.JSX.Element {
  const { t, i18n } = useTranslation('system');
  const number = new Intl.NumberFormat(i18n.language);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box component="dl" sx={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {METRICS.map((metric) => (
          <Box key={metric}>
            <Typography component="dt" variant="label">
              {t(`metric.${metric}`)}
            </Typography>
            <Typography component="dd" variant="number" sx={{ margin: 0 }}>
              {t('peak.percent', { value: number.format(thresholds[metric]) })}
            </Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="label">{t('thresholds.hint')}</Typography>
    </Box>
  );
}
