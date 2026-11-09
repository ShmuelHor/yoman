import { describe, expect, it } from 'vitest';
import { parseScreenSaverActive } from '../../../../src/collectors/lock/domain/screensaver-active.js';

describe('parseScreenSaverActive', () => {
  it.each([true, false])('reads %s', (active) => {
    // Act / Assert
    expect(parseScreenSaverActive([active])).toBe(active);
  });

  it.each([
    ['an empty body', []],
    ['a string', ['true']],
    ['a number', [1]],
    ['extra values', [true, true]],
  ])('rejects %s', (_case, body: unknown[]) => {
    // Act / Assert
    expect(parseScreenSaverActive(body)).toBeUndefined();
  });
});
