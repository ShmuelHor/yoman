import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import type { i18n } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import type { GatewayClient } from '../api/gateway.js';
import { DEFAULT_LANGUAGE, Language } from '../i18n/languages.js';
import type { Notifier } from '../notify/notifier.js';
import { NotifierProvider } from '../notify/notifier-provider.js';
import type { AppRouter } from '../router/router.js';
import { LocaleProvider } from '../theme/locale-provider.js';
import { ThemeProvider } from '../theme/theme-provider.js';
import { ApplySavedSettings } from './apply-saved-settings.js';
import { RootErrorBoundary } from './error-boundaries.js';

interface AppProps {
  readonly i18n: i18n;
  readonly queryClient: QueryClient;
  readonly notifier: Notifier;
  readonly router: AppRouter;
  readonly client: GatewayClient;
}

/** Keeps the MUI direction and locale in step with the UI language. */
function AppLocale({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const { i18n: instance } = useTranslation();
  const parsed = Language.safeParse(instance.resolvedLanguage);
  return (
    <LocaleProvider language={parsed.success ? parsed.data : DEFAULT_LANGUAGE}>
      {children}
    </LocaleProvider>
  );
}

export function App({ i18n, queryClient, notifier, router, client }: AppProps): React.JSX.Element {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AppLocale>
            <ApplySavedSettings client={client} />
            <NotifierProvider notifier={notifier}>
              <RootErrorBoundary>
                <RouterProvider router={router} />
              </RootErrorBoundary>
            </NotifierProvider>
          </AppLocale>
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
