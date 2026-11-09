// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../../src/components/button.js';

describe('Button', () => {
  afterEach(cleanup);

  it('is a secondary, non-submitting button by default', () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toContain('button--secondary');
  });

  it('renders the primary variant', () => {
    render(<Button variant="primary">Start</Button>);

    expect(screen.getByRole('button', { name: 'Start' }).className).toContain('button--primary');
  });

  it('calls onClick when pressed', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('can still submit a form when asked to', () => {
    render(<Button type="submit">Send</Button>);

    expect(screen.getByRole('button', { name: 'Send' }).getAttribute('type')).toBe('submit');
  });
});
