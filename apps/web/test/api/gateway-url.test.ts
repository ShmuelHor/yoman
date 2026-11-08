import { describe, expect, it } from 'vitest';

import { gatewayUrl } from '../../src/api/gateway-url.js';

describe('gatewayUrl', () => {
  it.each([
    ['127.0.0.1', 'http://127.0.0.1:4711'],
    ['localhost', 'http://localhost:4711'],
  ])('keeps the host name %s so the session cookie stays same-site', (hostname, expected) => {
    expect(gatewayUrl({ protocol: 'http:', hostname })).toBe(expected);
  });
});
