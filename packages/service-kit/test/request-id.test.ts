import { describe, expect, it } from 'vitest';

import { isValidRequestId, resolveRequestId } from '../src/request-id.js';

const MAX_LENGTH = 64;

describe('resolveRequestId', () => {
  it('keeps a well-formed id from the caller', () => {
    expect(resolveRequestId({ headers: { 'x-request-id': 'req-7f3a' } })).toBe('req-7f3a');
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['too long', 'a'.repeat(MAX_LENGTH + 1)],
    ['with a line break', 'abc\ndef'],
    ['with a space', 'abc def'],
    ['repeated', ['a', 'b']],
  ])('generates a new id when the header is %s', (_name, value) => {
    const id = resolveRequestId({ headers: { 'x-request-id': value } });
    expect(id).toMatch(/^req-[0-9a-f]{12}$/);
  });

  it('accepts exactly 64 characters', () => {
    expect(isValidRequestId('a'.repeat(MAX_LENGTH))).toBe(true);
  });
});
