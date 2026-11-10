// @vitest-environment happy-dom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Tag } from '../../src/components/tag.js';
import { renderWithTheme } from '../support/render-with-theme.js';

/** The chip element that carries the variant, around the text node's label span. */
function chipOf(text: string): HTMLElement | null {
  return screen.getByText(text).closest('.MuiChip-root');
}

describe('Tag', () => {
  afterEach(cleanup);

  it('is a neutral outlined chip by default', () => {
    renderWithTheme(<Tag>Work</Tag>);

    expect(chipOf('Work')?.className).toContain('MuiChip-colorDefault');
  });

  it('uses the accent colors for the anomaly variant', () => {
    renderWithTheme(<Tag variant="anomaly">Unusual</Tag>);

    expect(chipOf('Unusual')?.className).toContain('MuiChip-colorPrimary');
  });
});
