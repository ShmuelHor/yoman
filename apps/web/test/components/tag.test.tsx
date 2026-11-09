// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Tag } from '../../src/components/tag.js';

describe('Tag', () => {
  afterEach(cleanup);

  it.each([
    [undefined, 'tag--default'],
    ['anomaly', 'tag--anomaly'],
  ] as const)('renders the %s variant', (variant, className) => {
    render(variant === undefined ? <Tag>Work</Tag> : <Tag variant={variant}>Work</Tag>);

    expect(screen.getByText('Work').className).toContain(className);
  });
});
