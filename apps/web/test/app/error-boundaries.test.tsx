// @vitest-environment happy-dom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PageErrorBoundary, RootErrorBoundary } from '../../src/app/error-boundaries.js';
import { bundledResources } from '../../src/i18n/bundled.js';
import { createI18n } from '../../src/i18n/i18n.js';
import { renderWithTheme } from '../support/render-with-theme.js';

let crash = true;

function Crashing(): React.JSX.Element {
  if (crash) {
    throw new Error('internal secret detail');
  }
  return <p>page content</p>;
}

const hebrew = createI18n(bundledResources, document.createElement('html'));

function withI18n(ui: React.ReactNode): React.JSX.Element {
  return <I18nextProvider i18n={hebrew}>{ui}</I18nextProvider>;
}

describe('error boundaries', () => {
  beforeEach(() => {
    // React logs a caught render error; the test expects one.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(cleanup);

  it('shows a friendly screen instead of a blank page when the app crashes', () => {
    renderWithTheme(
      withI18n(
        <RootErrorBoundary>
          <Crashing />
        </RootErrorBoundary>,
      ),
    );

    expect(screen.getByRole('alert').textContent).toContain(hebrew.t('error.title'));
    expect(screen.queryByText(/internal secret detail/u)).toBeNull();
  });

  it('keeps the rest of the shell alive when a page crashes, and recovers on retry', async () => {
    crash = true;
    renderWithTheme(
      withI18n(
        <>
          <nav>shell</nav>
          <PageErrorBoundary resetKey="/week">
            <Crashing />
          </PageErrorBoundary>
        </>,
      ),
    );
    expect(screen.getByText('shell')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();

    crash = false;
    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByText('page content')).toBeTruthy();
  });
});
