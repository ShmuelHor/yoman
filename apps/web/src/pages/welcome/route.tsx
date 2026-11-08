import { useTranslation } from 'react-i18next';

import type { PageRoute } from '../../router/page-route.js';

/** Placeholder that proves page registration works. The Today page (T35) replaces it. */
function WelcomePage(): React.JSX.Element {
  const { t } = useTranslation('welcome');
  return (
    <>
      <h1>{t('title')}</h1>
      <p>{t('body')}</p>
    </>
  );
}

export const route: PageRoute = {
  path: '/',
  namespace: 'welcome',
  order: 0,
  Component: WelcomePage,
};
