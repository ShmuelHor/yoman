import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import { Button } from '../components/button.js';

interface ErrorFallbackProps {
  /** Resets the boundary (page) or reloads the app (root). */
  readonly onRetry: () => void;
}

/** A friendly screen for a crash. It never shows the error: its text is internal. */
export function ErrorFallback({ onRetry }: ErrorFallbackProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Box role="alert" sx={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 6 }}>
      <Typography variant="h1">{t('error.title')}</Typography>
      <Typography>{t('error.crashed')}</Typography>
      <Box>
        <Button variant="primary" onClick={onRetry}>
          {t('error.retry')}
        </Button>
      </Box>
    </Box>
  );
}
