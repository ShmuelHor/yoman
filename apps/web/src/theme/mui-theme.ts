import { createTheme, type Shadows, type Theme } from '@mui/material/styles';
import type { CSSProperties } from 'react';

import { type ColorTokens, colorTokens } from './color-tokens.js';
import type { ResolvedTheme } from './theme.js';

/** Chart styling from DESIGN.md rule 5. */
export interface ChartTokens {
  /** Line width, in px. */
  readonly strokeWidth: number;
  /** Opacity of the accent fill behind an anomaly region. */
  readonly anomalyOpacity: number;
}

declare module '@mui/material/styles' {
  // Turns on the CSS-variables typings: `theme.vars` and `colorSchemes`.
  interface CssThemeVariables {
    enabled: true;
  }
  interface Theme {
    chart: ChartTokens;
  }
  interface ThemeOptions {
    chart?: ChartTokens;
  }
  interface Palette {
    /** Every Paper and Ink color by its DESIGN.md name, as `--mui-palette-tokens-*`. */
    tokens: ColorTokens;
  }
  interface PaletteOptions {
    tokens?: ColorTokens;
  }
  interface Shape {
    /** The small radius of chart bars and category dots, in px. */
    radiusSm: number;
  }
  interface ShapeOptions {
    radiusSm?: number;
  }
  interface TypographyVariants {
    /** Frank Ruhl Libre, for numbers and titles; `fontFamily` is Heebo. */
    fontFamilySerif: string;
    hero: CSSProperties;
    number: CSSProperties;
    table: CSSProperties;
    label: CSSProperties;
  }
  interface TypographyVariantsOptions {
    fontFamilySerif?: string;
    hero?: CSSProperties;
    number?: CSSProperties;
    table?: CSSProperties;
    label?: CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    hero: true;
    number: true;
    table: true;
    label: true;
  }
}

/** `theme.spacing(n)` is n × 4px; DESIGN.md's 4, 8, 12, 16, 24, 32px are spacing 1, 2, 3, 4, 6, 8. */
const SPACING_UNIT_PX = 4;
const RADIUS_PX = 10;
const RADIUS_SM_PX = 3;
const FONT_SANS = '"Heebo", sans-serif';
const FONT_SERIF = '"Frank Ruhl Libre", serif';
const WEIGHT_REGULAR = 400;
const WEIGHT_MEDIUM = 500;
const SIZE_HERO_PX = 44;
const SIZE_NUMBER_PX = 28;
const SIZE_TITLE_PX = 24;
const SIZE_BODY_PX = 14;
const SIZE_LABEL_PX = 12;
const NUMBER_LINE_HEIGHT = 1.1;
const CHART: ChartTokens = { strokeWidth: 1.5, anomalyOpacity: 0.12 };

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

function colorScheme(theme: ResolvedTheme): { palette: ReturnType<typeof paletteOf> } {
  return { palette: paletteOf(colorTokens[theme]) };
}

const serifNumber: CSSProperties = {
  fontFamily: FONT_SERIF,
  fontWeight: WEIGHT_MEDIUM,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: NUMBER_LINE_HEIGHT,
};

const serifTitle: CSSProperties = { fontFamily: FONT_SERIF, fontWeight: WEIGHT_MEDIUM };

/**
 * The MUI theme for "Paper and Ink" (docs/DESIGN.md), and the home of every
 * design token except the colors (color-tokens.ts). Colors become CSS variables
 * scoped by `data-theme`, so light and dark switch in CSS on `<html>` or on any
 * element that sets the attribute, without a re-render.
 */
export const appTheme: Theme = createTheme({
  cssVariables: { colorSchemeSelector: 'data-theme' },
  colorSchemes: { light: colorScheme('light'), dark: colorScheme('dark') },
  shape: { borderRadius: RADIUS_PX, radiusSm: RADIUS_SM_PX },
  spacing: SPACING_UNIT_PX,
  shadows: NO_SHADOWS,
  chart: CHART,
  typography: {
    fontFamily: FONT_SANS,
    fontFamilySerif: FONT_SERIF,
    fontSize: SIZE_BODY_PX,
    fontWeightLight: WEIGHT_REGULAR,
    fontWeightRegular: WEIGHT_REGULAR,
    fontWeightMedium: WEIGHT_MEDIUM,
    fontWeightBold: WEIGHT_MEDIUM,
    h1: { ...serifTitle, fontSize: SIZE_TITLE_PX },
    h2: { ...serifTitle, fontSize: SIZE_BODY_PX },
    h3: { fontWeight: WEIGHT_MEDIUM, fontSize: SIZE_BODY_PX },
    body1: { fontSize: SIZE_BODY_PX },
    body2: { fontSize: SIZE_BODY_PX },
    button: { fontWeight: WEIGHT_MEDIUM, textTransform: 'none' },
    hero: { ...serifNumber, fontSize: SIZE_HERO_PX },
    number: { ...serifNumber, fontSize: SIZE_NUMBER_PX },
    table: {
      fontFamily: FONT_SERIF,
      fontWeight: WEIGHT_REGULAR,
      fontSize: SIZE_BODY_PX,
      fontVariantNumeric: 'tabular-nums',
    },
    label: { fontSize: SIZE_LABEL_PX, fontWeight: WEIGHT_REGULAR },
  },
  components: {
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiTypography: {
      defaultProps: {
        variantMapping: { hero: 'p', number: 'p', table: 'span', label: 'p' },
      },
      // The label role is always muted (DESIGN.md typography).
      variants: [
        {
          props: { variant: 'label' },
          style: ({ theme }) => ({ color: theme.vars.palette.tokens.muted }),
        },
      ],
    },
  },
});
