// @vitest-environment happy-dom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FocusBanner } from '../../src/components/focus-banner.js';
import { renderWithTheme } from '../support/render-with-theme.js';

describe('FocusBanner', () => {
  afterEach(cleanup);

  it('announces the focus status politely', () => {
    renderWithTheme(<FocusBanner>Focus mode · 47 min left</FocusBanner>);

    expect(screen.getByRole('status').textContent).toBe('Focus mode · 47 min left');
  });
});
