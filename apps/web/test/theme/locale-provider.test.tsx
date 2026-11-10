// @vitest-environment happy-dom
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { Language } from '../../src/i18n/languages.js';
import { LocaleProvider } from '../../src/theme/locale-provider.js';
import { ThemeProvider } from '../../src/theme/theme-provider.js';

function Probe(): React.JSX.Element {
  const { direction } = useTheme();
  // biome-ignore lint/plugin: the test checks how physical CSS is mirrored
  return <Box sx={{ marginLeft: '7px' }}>{direction}</Box>;
}

function renderIn(language: Language): HTMLElement {
  render(
    <ThemeProvider root={document.createElement('html')}>
      <LocaleProvider language={language}>
        <Probe />
      </LocaleProvider>
    </ThemeProvider>,
  );
  return screen.getByText(/^(?:rtl|ltr)$/u);
}

/** The CSS Emotion injected for one element, found through its generated class. */
function injectedCssFor(element: HTMLElement): string {
  const rules = [...document.querySelectorAll('style')].map((style) => style.textContent ?? '');
  const classes = [...element.classList];
  return rules.filter((rule) => classes.some((name) => rule.includes(`.${name}`))).join('\n');
}

describe('LocaleProvider', () => {
  afterEach(cleanup);

  it('lays Hebrew out right to left, mirroring physical CSS', () => {
    const probe = renderIn('he');

    expect(probe.textContent).toBe('rtl');
    expect(injectedCssFor(probe)).toContain('margin-right:7px');
  });

  it('lays English out left to right, leaving CSS as written', () => {
    const probe = renderIn('en');

    expect(probe.textContent).toBe('ltr');
    expect(injectedCssFor(probe)).toContain('margin-left:7px');
  });
});
