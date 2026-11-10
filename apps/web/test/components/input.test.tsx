// @vitest-environment happy-dom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Input } from '../../src/components/input.js';
import { renderWithTheme } from '../support/render-with-theme.js';

function ControlledInput(): React.JSX.Element {
  const [value, setValue] = useState('');
  return (
    <Input
      label="App name"
      value={value}
      onChange={(event): void => setValue(event.target.value)}
    />
  );
}

describe('Input', () => {
  afterEach(cleanup);

  it('is named by its visible label', () => {
    renderWithTheme(<Input label="App name" placeholder="Firefox" />);

    const field = screen.getByRole('textbox', { name: 'App name' });
    expect(field.getAttribute('placeholder')).toBe('Firefox');
  });

  it('passes typed text through onChange', async () => {
    const user = userEvent.setup();
    renderWithTheme(<ControlledInput />);
    const field = screen.getByRole('textbox', { name: 'App name' });

    await user.type(field, 'Code');

    expect(field).toHaveProperty('value', 'Code');
  });
});
