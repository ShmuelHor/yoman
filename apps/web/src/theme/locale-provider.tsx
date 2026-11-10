import { CacheProvider } from '@emotion/react';
import { enUS as materialEn, heIL as materialHe } from '@mui/material/locale';
import { ThemeProvider as MuiThemeProvider, type Theme } from '@mui/material/styles';
import { enUS as dataGridEn, heIL as dataGridHe } from '@mui/x-data-grid/locales';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { enUS as pickersEn, heIL as pickersHe } from '@mui/x-date-pickers/locales';
import { enUS as dateFnsEn } from 'date-fns/locale/en-US';
import { he as dateFnsHe } from 'date-fns/locale/he';
import { type ReactNode, useCallback } from 'react';

import { directionOf, type Language } from '../i18n/languages.js';
import { emotionCacheFor } from './emotion-cache.js';

interface MuiLocale {
  /** MUI's own strings (pagination, data grid, date pickers), as theme default props. */
  readonly components: Theme['components'];
  readonly dateFns: typeof dateFnsEn;
}

const LOCALES: Readonly<Record<Language, MuiLocale>> = {
  he: {
    components: {
      ...materialHe.components,
      ...dataGridHe.components,
      ...pickersHe.components,
    },
    dateFns: dateFnsHe,
  },
  en: {
    components: {
      ...materialEn.components,
      ...dataGridEn.components,
      ...pickersEn.components,
    },
    dateFns: dateFnsEn,
  },
};

interface LocaleProviderProps {
  readonly language: Language;
  readonly children: ReactNode;
}

/**
 * Localizes the MUI components below it: the theme direction, the Emotion
 * cache that mirrors styles for right to left, MUI's own strings, and the date
 * pickers' adapter locale. Setting `lang` and `dir` on an element stays the
 * caller's job (`<html>` for the app, a panel in the dev gallery).
 */
export function LocaleProvider({ language, children }: LocaleProviderProps): React.JSX.Element {
  const locale = LOCALES[language];
  const direction = directionOf(language);
  const localize = useCallback(
    (outer: Theme): Theme => ({
      ...outer,
      direction,
      components: { ...outer.components, ...locale.components },
    }),
    [direction, locale],
  );
  return (
    <CacheProvider value={emotionCacheFor(direction)}>
      <MuiThemeProvider theme={localize}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locale.dateFns}>
          {children}
        </LocalizationProvider>
      </MuiThemeProvider>
    </CacheProvider>
  );
}
