import type { ResolvedTheme } from './theme.js';

/**
 * The "Paper and Ink" colors (docs/DESIGN.md). This is the only file in the web
 * app that may hold a color literal; test/theme/no-raw-colors.test.ts enforces
 * that. The MUI theme turns them into CSS variables, and tokens.css aliases
 * those as the short `--bg`, `--accent`, ... names.
 */
export interface ColorTokens {
  readonly bg: string;
  readonly surface: string;
  readonly text: string;
  readonly muted: string;
  readonly line: string;
  readonly accent: string;
  readonly accentBg: string;
  readonly ok: string;
  readonly onAccent: string;
  readonly catWork: string;
  readonly catComms: string;
  readonly catFun: string;
  readonly catOther: string;
}

export const colorTokens: Readonly<Record<ResolvedTheme, ColorTokens>> = {
  light: {
    bg: '#f3ede2',
    surface: '#fbf7f0',
    text: '#1e1c19',
    muted: '#7a7368',
    line: '#ddd3c3',
    accent: '#b4532a',
    accentBg: '#f3ded2',
    ok: '#5e6b3a',
    onAccent: '#fbf7f0',
    catWork: '#b4532a',
    catComms: '#5e6b3a',
    catFun: '#c9a15b',
    catOther: '#8c8478',
  },
  dark: {
    bg: '#1b1916',
    surface: '#24211d',
    text: '#ede6d9',
    muted: '#a39a8b',
    line: '#3a352e',
    accent: '#e07b4f',
    accentBg: '#3a271e',
    ok: '#9aaa6a',
    onAccent: '#1b1916',
    catWork: '#e07b4f',
    catComms: '#9aaa6a',
    catFun: '#d9b26e',
    catOther: '#7d7568',
  },
};
