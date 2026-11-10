import Box from '@mui/material/Box';
import type { CSSObject } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { DayReport } from '@yoman/shared/reports';
import { useTranslation } from 'react-i18next';
import { categoryColor } from './category-color.js';
import { splitDuration } from './format.js';

interface TimelineProps {
  readonly byCategory: DayReport['byCategory'];
}

/**
 * Today's time split by category as one bar with a legend. The gateway sends
 * category totals, not a time axis, so this is a proportion bar; the legend
 * carries the exact durations so color is never the only signal.
 */
export function Timeline({ byCategory }: TimelineProps): React.JSX.Element {
  const { t } = useTranslation('today');
  const total = byCategory.reduce((sum, entry) => sum + entry.seconds, 0);
  return (
    <Box component="figure" sx={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box
        aria-hidden
        sx={{
          display: 'flex',
          blockSize: 24,
          borderRadius: (theme) => `${theme.shape.radiusSm}px`,
          overflow: 'hidden',
        }}
      >
        {byCategory.map((entry) => (
          <Box
            key={entry.category ?? 'idle'}
            sx={(theme): CSSObject => ({
              flexGrow: entry.seconds,
              flexBasis: 0,
              backgroundColor: categoryColor(theme, entry.category),
            })}
          />
        ))}
      </Box>
      <Box
        component="ul"
        sx={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 4 }}
      >
        {total === 0
          ? null
          : byCategory.map((entry) => (
              <Box
                key={entry.category ?? 'idle'}
                component="li"
                sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
              >
                <Box
                  aria-hidden
                  sx={(theme): CSSObject => ({
                    inlineSize: 10,
                    blockSize: 10,
                    borderRadius: `${theme.shape.radiusSm}px`,
                    backgroundColor: categoryColor(theme, entry.category),
                  })}
                />
                <Typography variant="label">
                  {t(`category.${entry.category ?? 'idle'}`, { defaultValue: entry.category })}
                  {' · '}
                  {t('duration', splitDuration(entry.seconds))}
                </Typography>
              </Box>
            ))}
      </Box>
    </Box>
  );
}
