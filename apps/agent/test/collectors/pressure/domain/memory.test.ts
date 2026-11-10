import { LIMITS } from '@yoman/shared/limits';
import { describe, expect, it } from 'vitest';
import { parseMemoryReading } from '../../../../src/collectors/pressure/domain/memory.js';

const OVERSIZED_DIGITS = 16;

function meminfo(values: Record<string, number>): string {
  return Object.entries(values)
    .map(([name, kb]) => `${name}:        ${kb} kB`)
    .join('\n');
}

describe('parseMemoryReading', () => {
  it('reports available memory as a share of the total', () => {
    // Arrange
    const text = meminfo({
      MemTotal: 16_000_000,
      MemFree: 1_000_000,
      MemAvailable: 4_000_000,
      SwapTotal: 2_000_000,
      SwapFree: 2_000_000,
    });

    // Act / Assert
    expect(parseMemoryReading(text)).toEqual({ memAvailablePct: 25, swapActive: false });
  });

  it('marks swap active once any of it is in use', () => {
    // Arrange
    const text = meminfo({
      MemTotal: 3_000_000,
      MemAvailable: 100_000,
      SwapTotal: 2_000_000,
      SwapFree: 1_999_000,
    });

    // Act / Assert
    expect(parseMemoryReading(text)).toEqual({ memAvailablePct: 3.33, swapActive: true });
  });

  it('treats a machine without swap as not swapping', () => {
    // Arrange
    const text = meminfo({ MemTotal: 1_000, MemAvailable: 10, SwapTotal: 0, SwapFree: 0 });

    // Act / Assert
    expect(parseMemoryReading(text)).toEqual({ memAvailablePct: 1, swapActive: false });
  });

  it('caps available memory at the total', () => {
    // Arrange
    const text = meminfo({ MemTotal: 1_000, MemAvailable: 2_000, SwapTotal: 0, SwapFree: 0 });

    // Act / Assert
    expect(parseMemoryReading(text)?.memAvailablePct).toEqual(LIMITS.percent);
  });

  it.each([
    ['no MemAvailable', meminfo({ MemTotal: 1_000, SwapTotal: 0, SwapFree: 0 })],
    ['a zero total', meminfo({ MemTotal: 0, MemAvailable: 0, SwapTotal: 0, SwapFree: 0 })],
    [
      'an oversized value',
      `MemTotal: ${'9'.repeat(OVERSIZED_DIGITS)} kB\nMemAvailable: 1 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB`,
    ],
    ['an empty file', ''],
  ])('rejects %s', (_case, text) => {
    // Act / Assert
    expect(parseMemoryReading(text)).toBeUndefined();
  });
});
