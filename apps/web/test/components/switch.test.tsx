// @vitest-environment happy-dom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Switch } from '../../src/components/switch.js';
import { renderWithTheme } from '../support/render-with-theme.js';

describe('Switch', () => {
  afterEach(cleanup);

  it.each([true, false])('exposes checked=%s to assistive technology', (checked) => {
    renderWithTheme(<Switch checked={checked} onChange={vi.fn()} label="Focus mode" />);

    expect(screen.getByRole('switch', { name: 'Focus mode', checked })).toBeDefined();
  });

  it('asks to flip its state when pressed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(<Switch checked={false} onChange={onChange} label="Focus mode" />);

    await user.click(screen.getByRole('switch', { name: 'Focus mode' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is disabled when asked to', () => {
    renderWithTheme(<Switch checked onChange={vi.fn()} label="Focus mode" disabled />);

    expect(screen.getByRole('switch', { name: 'Focus mode' })).toHaveProperty('disabled', true);
  });
});
