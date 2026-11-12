import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import { isFuture, parseLocalDate, shiftDate } from './day.js';

interface DayPickerProps {
  readonly date: string;
  readonly now: Date;
  readonly onChange: (date: string) => void;
}

/** Steps the load chart one day back or forward; the future has no data, so forward stops at today. */
export function DayPicker({ date, now, onChange }: DayPickerProps): React.JSX.Element {
  const { t, i18n } = useTranslation('system');
  // Arrows point along the reading direction, which the theme knows.
  const rtl = useTheme().direction === 'rtl';
  const label = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' }).format(
    parseLocalDate(date),
  );
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <IconButton
        aria-label={t('day.previous')}
        onClick={(): void => onChange(shiftDate(date, -1))}
      >
        {rtl ? <ChevronRight /> : <ChevronLeft />}
      </IconButton>
      <Typography variant="label">{label}</Typography>
      <IconButton
        aria-label={t('day.next')}
        disabled={isFuture(shiftDate(date, 1), now)}
        onClick={(): void => onChange(shiftDate(date, 1))}
      >
        {rtl ? <ChevronLeft /> : <ChevronRight />}
      </IconButton>
    </Box>
  );
}
