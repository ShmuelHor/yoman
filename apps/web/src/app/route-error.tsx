import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

/** Shown for an unknown path. */
export function NotFound(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <main>
      <Typography variant="h1">{t('error.notFound')}</Typography>
    </main>
  );
}

/** Shown when a loader or the router itself fails. Render errors stay inside the page boundary. */
export function RouteError(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <main>
      <Typography variant="h1">{t('error.title')}</Typography>
    </main>
  );
}
