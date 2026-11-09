// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Card } from '../../src/components/card.js';

describe('Card', () => {
  afterEach(cleanup);

  it('shows label, value and context, and is named by its label', () => {
    render(<Card label="Screen time" value="6:42" context="47 min more than yesterday" />);

    const card = screen.getByRole('region', { name: 'Screen time' });
    expect(card.textContent).toBe('Screen time6:4247 min more than yesterday');
  });

  it('leaves the context line out when there is none', () => {
    render(<Card label="Screen time" value="6:42" />);

    expect(screen.getByRole('region', { name: 'Screen time' }).childElementCount).toBe(2);
  });

  it.each([
    [undefined, 'card__value--secondary'],
    ['hero', 'card__value--hero'],
  ] as const)('sizes the value for the %s size', (size, className) => {
    render(
      size === undefined ? (
        <Card label="Load" value="12%" />
      ) : (
        <Card label="Load" value="12%" size={size} />
      ),
    );

    expect(screen.getByText('12%').className).toContain(className);
  });
});
