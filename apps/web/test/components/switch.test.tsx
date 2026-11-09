// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Switch } from '../../src/components/switch.js';

describe('Switch', () => {
  afterEach(cleanup);

  it.each([true, false])('exposes checked=%s to assistive technology', (checked) => {
    render(<Switch checked={checked} onChange={vi.fn()} label="Focus mode" />);

    expect(screen.getByRole('switch', { name: 'Focus mode' }).getAttribute('aria-checked')).toBe(
      String(checked),
    );
  });

  it('asks to flip its state when pressed', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Focus mode" />);

    fireEvent.click(screen.getByRole('switch', { name: 'Focus mode' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('ignores presses while disabled', () => {
    const onChange = vi.fn();
    render(<Switch checked onChange={onChange} label="Focus mode" disabled />);

    fireEvent.click(screen.getByRole('switch', { name: 'Focus mode' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
