import { LIMITS } from '@yoman/shared/limits';
import { describe, expect, it } from 'vitest';
import { parseIdletime } from '../../../../src/collectors/idle/domain/idle-time.js';

const IDLE_MS = 125_000;
const DAYS_PER_WEEK = 7n;

describe('parseIdletime', () => {
  it('turns the uint64 reply into milliseconds', () => {
    // Act / Assert
    expect(parseIdletime([BigInt(IDLE_MS)])).toBe(IDLE_MS);
  });

  it('caps a very long idle time at the contract limit', () => {
    // Arrange
    const aWeekMs = BigInt(LIMITS.idleMs) * DAYS_PER_WEEK;

    // Act / Assert
    expect(parseIdletime([aWeekMs])).toBe(LIMITS.idleMs);
  });

  it.each([
    ['an empty body', []],
    ['a number instead of a uint64', [IDLE_MS]],
    ['a string', ['125000']],
    ['a negative value', [-1n]],
    ['extra values', [1n, 2n]],
  ])('rejects %s', (_case, body: unknown[]) => {
    // Act / Assert
    expect(parseIdletime(body)).toBeUndefined();
  });
});
