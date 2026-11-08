// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { applyTheme, resolveTheme, type ThemePreference } from '../../src/theme/theme.js';

describe('resolveTheme', () => {
  it.each<[ThemePreference, boolean, string]>([
    ['system', true, 'dark'],
    ['system', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
  ])('%s with a dark system = %s gives %s', (preference, dark, expected) => {
    expect(resolveTheme(preference, dark)).toBe(expected);
  });
});

describe('applyTheme', () => {
  it('sets data-theme and color-scheme on the root', () => {
    const root = document.createElement('html');

    applyTheme(root, 'dark');

    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
  });
});
