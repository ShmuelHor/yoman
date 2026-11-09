// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AlertCard } from '../../src/components/alert-card.js';

describe('AlertCard', () => {
  afterEach(cleanup);

  it('is a region named by its heading, with the body below', () => {
    render(<AlertCard title="Unusual drain">Firefox used 30% of the battery.</AlertCard>);

    const card = screen.getByRole('region', { name: 'Unusual drain' });
    expect(screen.getByRole('heading', { name: 'Unusual drain' })).toBeDefined();
    expect(card.textContent).toContain('Firefox used 30% of the battery.');
  });
});
