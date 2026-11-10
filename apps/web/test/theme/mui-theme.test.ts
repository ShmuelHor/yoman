import { describe, expect, it } from 'vitest';

import { colorTokens } from '../../src/theme/color-tokens.js';
import { appTheme } from '../../src/theme/mui-theme.js';

const LIGHT_SELECTOR = ':root, [data-theme="light"]';
const DARK_SELECTOR = '[data-theme="dark"]';
const WEIGHT_REGULAR = 400;
const RADIUS_PX = 10;
const RADIUS_SM_PX = 3;
/** theme.spacing(6) is DESIGN.md's fifth step, 24px (6 × the 4px unit). */
const SPACE_5 = 6;
const CHART_STROKE_PX = 1.5;
const ANOMALY_OPACITY = 0.12;
const HERO_PX = 44;
const WEIGHT_MEDIUM = 500;

/** The CSS variables MUI generates, keyed by the selector they are declared on. */
function variablesBySelector(): Map<string, Record<string, unknown>> {
  const sheets = new Map<string, Record<string, unknown>>();
  for (const sheet of appTheme.generateStyleSheets()) {
    for (const [selector, declarations] of Object.entries(sheet)) {
      sheets.set(selector, { ...sheets.get(selector), ...declarations });
    }
  }
  return sheets;
}

describe('appTheme', () => {
  it.each([
    ['light', LIGHT_SELECTOR],
    ['dark', DARK_SELECTOR],
  ] as const)('declares every %s color token under %s', (scheme, selector) => {
    const variables = variablesBySelector().get(selector);

    for (const [name, value] of Object.entries(colorTokens[scheme])) {
      expect(variables?.[`--mui-palette-tokens-${name}`]).toBe(value);
    }
  });

  it('maps the main palette roles onto the tokens', () => {
    const { palette } = appTheme.colorSchemes.light ?? {};

    expect(palette?.primary.main).toBe(colorTokens.light.accent);
    expect(palette?.success.main).toBe(colorTokens.light.ok);
    expect(palette?.background.default).toBe(colorTokens.light.bg);
    expect(palette?.background.paper).toBe(colorTokens.light.surface);
    expect(palette?.text.secondary).toBe(colorTokens.light.muted);
  });

  it('is flat: every elevation has no shadow (DESIGN.md rule 4)', () => {
    expect(new Set(appTheme.shadows)).toEqual(new Set(['none']));
  });

  it('carries the DESIGN.md radii, spacing scale and chart tokens', () => {
    expect(appTheme.shape).toMatchObject({ borderRadius: RADIUS_PX, radiusSm: RADIUS_SM_PX });
    expect(appTheme.spacing(SPACE_5)).toBe('calc(6 * var(--mui-spacing, 4px))');
    expect(appTheme.chart).toEqual({
      strokeWidth: CHART_STROKE_PX,
      anomalyOpacity: ANOMALY_OPACITY,
    });
  });

  it('sets numbers in the serif with tabular figures', () => {
    expect(appTheme.typography.hero).toMatchObject({
      fontFamily: appTheme.typography.fontFamilySerif,
      fontSize: HERO_PX,
      fontVariantNumeric: 'tabular-nums',
    });
  });

  it('uses only the two allowed font weights', () => {
    const { fontWeightLight, fontWeightRegular, fontWeightMedium, fontWeightBold } =
      appTheme.typography;

    expect(new Set([fontWeightLight, fontWeightRegular, fontWeightMedium, fontWeightBold])).toEqual(
      new Set([WEIGHT_REGULAR, WEIGHT_MEDIUM]),
    );
  });
});
