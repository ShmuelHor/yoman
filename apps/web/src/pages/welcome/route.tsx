import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import type { PageRoute } from '../../router/page-route.js';

/** Placeholder that proves page registration works. The Today page (T35) replaces it. */
function WelcomePage(): React.JSX.Element {
  const { t } = useTranslation('welcome');
  return (
    <>
      <Typography variant="h1">{t('title')}</Typography>
      <Typography>{t('body')}</Typography>
    </>
  );
}

export const route: PageRoute = {
  path: '/',
  namespace: 'welcome',
  order: 0,
  Component: WelcomePage,
};
