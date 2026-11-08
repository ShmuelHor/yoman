import { describe, expect, it } from 'vitest';

import { parseSystemError } from '../lib/system-error.js';

describe('parseSystemError', () => {
  it('reads code and message from a Node.js system error', () => {
    const error = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    expect(parseSystemError(error)).toMatchObject({ code: 'ENOENT', message: 'no such file' });
  });

  it('accepts an error without a code', () => {
    expect(parseSystemError(new Error('boom')).code).toBeUndefined();
  });

  it('rejects a value that is not an error shape', () => {
    expect(() => parseSystemError('nope')).toThrow();
  });
});
