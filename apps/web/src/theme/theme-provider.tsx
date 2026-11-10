import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import { AppBaseline } from './app-baseline.js';
import { appTheme } from './mui-theme.js';
import {
  applyTheme,
  DARK_QUERY,
  DEFAULT_THEME,
  type ResolvedTheme,
  resolveTheme,
  type ThemePreference,
} from './theme.js';
// The provider owns the look, so the fonts load wherever it is used.
import './fonts.js';

interface ThemeState {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  readonly setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeState | undefined>(undefined);

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return (): void => query.removeEventListener('change', onChange);
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

interface ThemeProviderProps {
  readonly children: ReactNode;
  readonly initial?: ThemePreference;
  readonly root?: HTMLElement;
}

/**
 * Owns the color theme. `system` follows the OS live, through the
 * `prefers-color-scheme` media query. Saving the choice to the gateway settings
 * arrives with the Settings page; until then it lasts for the page's lifetime.
 *
 * It also provides the MUI theme. `data-theme` on the root, which this provider
 * alone writes, switches MUI's color variables in CSS, so MUI is told neither
 * to write the attribute (`colorSchemeNode`) nor to keep its own mode in
 * localStorage (`storageManager`).
 */
export function ThemeProvider({
  children,
  initial = DEFAULT_THEME,
  root = document.documentElement,
}: ThemeProviderProps): React.JSX.Element {
  const [preference, setPreference] = useState<ThemePreference>(initial);
  const prefersDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark);
  const resolved = resolveTheme(preference, prefersDark);

  useEffect(() => {
    applyTheme(root, resolved);
  }, [root, resolved]);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved]);
  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={appTheme} colorSchemeNode={null} storageManager={null}>
        <AppBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const state = useContext(ThemeContext);
  if (state === undefined) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return state;
}
