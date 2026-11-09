import { describe, expect, it } from 'vitest';

import { isAllowedHost, isAllowedOrigin } from '../../src/core/origins.js';

describe('isAllowedHost', () => {
  it.each(['127.0.0.1:4711', 'localhost:4711', 'LOCALHOST:4711'])('accepts %s', (host) => {
    expect(isAllowedHost(host)).toBe(true);
  });

  it.each([
    undefined,
    '',
    'localhost',
    '127.0.0.1',
    '127.0.0.1:4710',
    '127.0.0.1:8080',
    'evil.example',
    'localhost:4711.evil.example',
    '0.0.0.0:4711',
    '[::1]:4711',
  ])('rejects %s', (host) => {
    expect(isAllowedHost(host)).toBe(false);
  });
});

describe('isAllowedOrigin', () => {
  it.each(['http://127.0.0.1:4710', 'http://localhost:4710'])('accepts %s', (origin) => {
    expect(isAllowedOrigin(origin)).toBe(true);
  });

  it.each([
    undefined,
    'null',
    'https://127.0.0.1:4710',
    'http://127.0.0.1:4711',
    'http://localhost:4710.evil.example',
    'http://evil.example',
    'http://127.0.0.1:4710/',
  ])('rejects %s', (origin) => {
    expect(isAllowedOrigin(origin)).toBe(false);
  });
});
