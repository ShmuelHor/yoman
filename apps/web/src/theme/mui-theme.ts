import { createTheme, type Shadows, type Theme } from '@mui/material/styles';
import type { CSSProperties } from 'react';

import { type ColorTokens, colorTokens } from './color-tokens.js';
import type { ResolvedTheme } from './theme.js';

declare module '@mui/material/styles' {
  // Turns on the CSS-variables typings: `theme.vars` and `colorSchemes`.
  interface CssThemeVariables {
    enabled: true;
  }
  interface Palette {
    /** Every Paper and Ink color by its DESIGN.md name, as `--mui-palette-tokens-*`. */
    tokens: ColorTokens;
  }
  interface PaletteOptions {
    tokens?: ColorTokens;
  }
  interface TypographyVariants {
    hero: CSSProperties;
    number: CSSProperties;
    label: CSSProperties;
  }
  interface TypographyVariantsOptions {
    hero?: CSSProperties;
    number?: CSSProperties;
    label?: CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    hero: true;
    number: true;
    label: true;
  }
}

/** `theme.spacing(n)` is n × `--space-1`, so 1–4 match `--space-1..4`. */
const SPACING_UNIT_PX = 4;
const FONT_SANS = 'var(--font-sans)';
const FONT_SERIF = 'var(--font-serif)';
const WEIGHT_REGULAR = 400;
const WEIGHT_MEDIUM = 500;
const SIZE_BODY_PX = 14;
const NUMBER_LINE_HEIGHT = 1.1;

/** DESIGN.md rule 4: no shadows anywhere, so every elevation level is flat. */
const NO_SHADOWS: Shadows = [
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
];

/** Maps the Paper and Ink colors onto MUI's palette roles, and keeps all of them as `tokens`. */
function paletteOf(tokens: ColorTokens): NonNullable<Parameters<typeof createTheme>[0]>['palette'] {
  return {
    tokens,
    primary: { main: tokens.accent, contrastText: tokens.onAccent },
    success: { main: tokens.ok, contrastText: tokens.onAccent },
    background: { default: tokens.bg, paper: tokens.surface },
    text: { primary: tokens.text, secondary: tokens.muted },
    divider: tokens.line,
  };
}

const serifNumber: CSSProperties = {
  fontFamily: FONT_SERIF,
  fontWeight: WEIGHT_MEDIUM,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: NUMBER_LINE_HEIGHT,
};

function colorScheme(theme: ResolvedTheme): { palette: ReturnType<typeof paletteOf> } {
  return { palette: paletteOf(colorTokens[theme]) };
}

/**
 * The MUI theme for "Paper and Ink" (docs/DESIGN.md). Colors become CSS
 * variables scoped by `data-theme`, so the light and dark values switch in CSS
 * on `<html>` or on any element that sets the attribute, without a re-render.
 * Fonts, sizes and the radius point at the tokens.css variables.
 */
export const appTheme: Theme = createTheme({
  cssVariables: { colorSchemeSelector: 'data-theme' },
  colorSchemes: { light: colorScheme('light'), dark: colorScheme('dark') },
  shape: { borderRadius: 'var(--radius)' },
  spacing: SPACING_UNIT_PX,
  shadows: NO_SHADOWS,
  typography: {
    fontFamily: FONT_SANS,
    fontSize: SIZE_BODY_PX,
    fontWeightLight: WEIGHT_REGULAR,
    fontWeightRegular: WEIGHT_REGULAR,
    fontWeightMedium: WEIGHT_MEDIUM,
    fontWeightBold: WEIGHT_MEDIUM,
    h1: { fontFamily: FONT_SERIF, fontSize: 'var(--font-size-title)', fontWeight: WEIGHT_MEDIUM },
    h2: { fontFamily: FONT_SERIF, fontSize: 'var(--font-size-body)', fontWeight: WEIGHT_MEDIUM },
    body1: { fontSize: 'var(--font-size-body)' },
    body2: { fontSize: 'var(--font-size-body)' },
    button: { fontWeight: WEIGHT_MEDIUM, textTransform: 'none' },
    hero: { ...serifNumber, fontSize: 'var(--font-size-hero)' },
    number: { ...serifNumber, fontSize: 'var(--font-size-number)' },
    label: {
      color: 'var(--muted)',
      fontSize: 'var(--font-size-label)',
      fontWeight: WEIGHT_REGULAR,
    },
  },
  components: {
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiTypography: {
      defaultProps: {
        variantMapping: { hero: 'p', number: 'p', label: 'p' },
      },
    },
  },
});
