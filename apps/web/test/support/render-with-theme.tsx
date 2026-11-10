import { type RenderResult, render } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { Language } from '../../src/i18n/languages.js';
import { LocaleProvider } from '../../src/theme/locale-provider.js';
import { ThemeProvider } from '../../src/theme/theme-provider.js';

/**
 * Renders UI inside the app's MUI theme and locale, as the app shell does. The
 * theme attribute goes on a detached element so tests never touch `<html>`.
 */
export function renderWithTheme(ui: ReactNode, language: Language = 'en'): RenderResult {
  return render(
    <ThemeProvider root={document.createElement('html')}>
      <LocaleProvider language={language}>{ui}</LocaleProvider>
    </ThemeProvider>,
  );
}
