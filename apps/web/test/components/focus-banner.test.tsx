// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FocusBanner } from '../../src/components/focus-banner.js';

describe('FocusBanner', () => {
  afterEach(cleanup);

  it('announces the focus status politely', () => {
    render(<FocusBanner>Focus mode · 47 min left</FocusBanner>);

    expect(screen.getByRole('status').textContent).toBe('Focus mode · 47 min left');
  });
});
