// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider, useTheme } from '../../src/theme/theme-provider.js';

/** A controllable `prefers-color-scheme: dark` media query. */
function fakeSystemTheme(initiallyDark: boolean): { setDark: (dark: boolean) => void } {
  let dark = initiallyDark;
  const listeners = new Set<() => void>();
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        get matches(): boolean {
          return dark;
        },
        media: query,
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
        // MUI's provider still watches the system theme through the legacy API.
        addListener: (listener: () => void) => listeners.add(listener),
        removeListener: (listener: () => void) => listeners.delete(listener),
      }) as unknown as MediaQueryList,
  );
  return {
    setDark(next): void {
      dark = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

function Probe(): React.JSX.Element {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <button type="button" onClick={(): void => setPreference('light')}>
      {`${preference}:${resolved}`}
    </button>
  );
}

describe('ThemeProvider', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('html');
  });

  afterEach(cleanup);

  it('follows the system theme live while the preference is system', () => {
    const system = fakeSystemTheme(false);
    render(
      <ThemeProvider root={root}>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button').textContent).toBe('system:light');
    expect(root.getAttribute('data-theme')).toBe('light');

    act(() => system.setDark(true));

    expect(screen.getByRole('button').textContent).toBe('system:dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('ignores the system once the user picks a theme', () => {
    const system = fakeSystemTheme(true);
    render(
      <ThemeProvider root={root}>
        <Probe />
      </ThemeProvider>,
    );

    act(() => screen.getByRole('button').click());
    act(() => system.setDark(true));

    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('honors an initial preference', () => {
    fakeSystemTheme(false);
    render(
      <ThemeProvider root={root} initial="dark">
        <Probe />
      </ThemeProvider>,
    );

    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('throws when useTheme is used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Probe />)).toThrow('useTheme must be used inside ThemeProvider');
  });
});
