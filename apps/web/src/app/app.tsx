import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { i18n } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { type createBrowserRouter, RouterProvider } from 'react-router';

import { DEFAULT_LANGUAGE, Language } from '../i18n/languages.js';
import { LocaleProvider } from '../theme/locale-provider.js';
import { ThemeProvider } from '../theme/theme-provider.js';

interface AppProps {
  readonly i18n: i18n;
  readonly queryClient: QueryClient;
  readonly router: ReturnType<typeof createBrowserRouter>;
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

export function App({ i18n, queryClient, router }: AppProps): React.JSX.Element {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AppLocale>
            <RouterProvider router={router} />
          </AppLocale>
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
