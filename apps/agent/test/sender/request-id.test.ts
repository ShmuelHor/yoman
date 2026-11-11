import { describe, expect, it } from 'vitest';

import { createRequestId } from '../../src/sender/request-id.js';

describe('createRequestId', () => {
  it('makes an id the gateway accepts, and a different one each time', () => {
    const first = createRequestId();
    expect(first).toMatch(/^req-[0-9a-f]{12}$/);
    expect(createRequestId()).not.toBe(first);
  });
});
