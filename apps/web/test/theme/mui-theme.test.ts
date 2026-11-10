import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { colorTokens } from '../../src/theme/color-tokens.js';
import { appTheme } from '../../src/theme/mui-theme.js';

const TOKENS_CSS = fileURLToPath(new URL('../../src/theme/tokens.css', import.meta.url));
const LIGHT_SELECTOR = ':root, [data-theme="light"]';
const DARK_SELECTOR = '[data-theme="dark"]';
const WEIGHT_REGULAR = 400;
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

  it('takes the radius from tokens.css', () => {
    expect(appTheme.shape.borderRadius).toBe('var(--radius)');
  });

  it('uses only the two allowed font weights', () => {
    const { fontWeightLight, fontWeightRegular, fontWeightMedium, fontWeightBold } =
      appTheme.typography;

    expect(new Set([fontWeightLight, fontWeightRegular, fontWeightMedium, fontWeightBold])).toEqual(
      new Set([WEIGHT_REGULAR, WEIGHT_MEDIUM]),
    );
  });
});

describe('tokens.css color aliases', () => {
  it('point only at variables the theme declares', async () => {
    const css = await readFile(TOKENS_CSS, 'utf8');
    const light = variablesBySelector().get(LIGHT_SELECTOR) ?? {};
    const referenced = [...css.matchAll(/var\((--mui-[\w-]+)\)/gu)].flatMap(
      ([, name]) => name ?? [],
    );

    expect(referenced.length).toBeGreaterThan(0);
    for (const name of referenced) {
      expect(light, `${name}`).toHaveProperty([name]);
    }
  });
});
