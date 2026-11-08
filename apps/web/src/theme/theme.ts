import { z } from 'zod';

/** The user's choice, stored in settings (SPEC §6). */
export const ThemePreference = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof ThemePreference>;

/** What the page actually shows. Tokens (T26) key their colors off `data-theme`. */
export type ResolvedTheme = 'light' | 'dark';

export const DEFAULT_THEME: ThemePreference = 'system';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return preference;
}

/** Sets `data-theme` on `<html>`, and `color-scheme` so native controls match. */
export function applyTheme(root: HTMLElement, theme: ResolvedTheme): void {
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
}
