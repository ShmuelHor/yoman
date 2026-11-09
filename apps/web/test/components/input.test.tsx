// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Input } from '../../src/components/input.js';

describe('Input', () => {
  afterEach(cleanup);

  it('is named by its visible label', () => {
    render(<Input label="App name" placeholder="Firefox" />);

    const field = screen.getByRole('textbox', { name: 'App name' });
    expect(field.getAttribute('placeholder')).toBe('Firefox');
  });

  it('passes typed text to onChange', () => {
    const onChange = vi.fn();
    render(<Input label="App name" value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'App name' }), {
      target: { value: 'Code' },
    });

    expect(onChange).toHaveBeenCalledOnce();
  });
});
