import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useTranslation } from 'react-i18next';

import { RANGE_DAYS, type RangeDays } from './search.js';

interface RangeSelectProps {
  readonly days: number;
  readonly onChange: (days: RangeDays) => void;
}

/** Picks how many days the trend, the cycles and the drain table cover. */
export function RangeSelect({ days, onChange }: RangeSelectProps): React.JSX.Element {
  const { t } = useTranslation('battery');
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={days}
      aria-label={t('range.label')}
      onChange={(_event, value: number | null): void => {
        const next = RANGE_DAYS.find((option) => option === value);
        if (next !== undefined) {
          onChange(next);
        }
      }}
    >
      {RANGE_DAYS.map((option) => (
        <ToggleButton key={option} value={option}>
          {t('range.days', { count: option })}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
