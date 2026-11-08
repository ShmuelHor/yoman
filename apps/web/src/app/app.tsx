import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { i18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { type createBrowserRouter, RouterProvider } from 'react-router';

import { ThemeProvider } from '../theme/theme-provider.js';

interface AppProps {
  readonly i18n: i18n;
  readonly queryClient: QueryClient;
  readonly router: ReturnType<typeof createBrowserRouter>;
}

export function App({ i18n, queryClient, router }: AppProps): React.JSX.Element {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
