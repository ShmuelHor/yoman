import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useRouteError } from 'react-router';

const NOT_FOUND = 404;

/** Shown for unknown paths and for errors thrown while rendering a page. */
export function RouteError(): React.JSX.Element {
  const { t } = useTranslation();
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === NOT_FOUND;
  return (
    <main>
      <Typography variant="h1">{notFound ? t('error.notFound') : t('error.title')}</Typography>
    </main>
  );
}
