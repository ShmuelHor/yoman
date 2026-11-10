// @vitest-environment happy-dom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../../src/components/button.js';
import { renderWithTheme } from '../support/render-with-theme.js';

describe('Button', () => {
  afterEach(cleanup);

  it('is an outlined, non-submitting button by default', () => {
    renderWithTheme(<Button>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toContain('MuiButton-outlined');
  });

  it('fills the primary variant with the accent color', () => {
    renderWithTheme(<Button variant="primary">Start</Button>);

    const { className } = screen.getByRole('button', { name: 'Start' });
    expect(className).toContain('MuiButton-contained');
    expect(className).toContain('MuiButton-colorPrimary');
  });

  it('calls onClick when pressed', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithTheme(<Button onClick={onClick}>Save</Button>);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when asked to', () => {
    renderWithTheme(<Button disabled>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
  });

  it('can still submit a form when asked to', () => {
    renderWithTheme(<Button type="submit">Send</Button>);

    expect(screen.getByRole('button', { name: 'Send' }).getAttribute('type')).toBe('submit');
  });
});
