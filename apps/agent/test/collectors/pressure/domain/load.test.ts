import { describe, expect, it } from 'vitest';
import { isUnderLoad } from '../../../../src/collectors/pressure/domain/load.js';
import type { MemoryReading } from '../../../../src/collectors/pressure/domain/memory.js';
import type { PressureReading } from '../../../../src/collectors/pressure/domain/pressure.js';

const CALM: PressureReading = {
  cpu: { some: 40, full: 0 },
  memory: { some: 10, full: 50 },
  io: { some: 30, full: 0 },
};
const PLENTY: MemoryReading = { memAvailablePct: 60, swapActive: true };

describe('isUnderLoad', () => {
  it('stays calm at exactly the thresholds, since an incident needs them exceeded', () => {
    // Act / Assert
    expect(isUnderLoad(CALM, PLENTY)).toBe(false);
  });

  it.each([
    ['cpu', { ...CALM, cpu: { some: 40.01, full: 0 } }],
    ['memory', { ...CALM, memory: { some: 10.01, full: 0 } }],
    ['io', { ...CALM, io: { some: 30.01, full: 0 } }],
  ])('is under load when %s some avg10 exceeds its threshold', (_resource, pressure) => {
    // Act / Assert
    expect(isUnderLoad(pressure, PLENTY)).toBe(true);
  });

  it('is under load when memory is nearly gone while swapping', () => {
    // Act / Assert
    expect(isUnderLoad(CALM, { memAvailablePct: 4.99, swapActive: true })).toBe(true);
  });

  it('is not under load on low memory without swapping', () => {
    // Act / Assert
    expect(isUnderLoad(CALM, { memAvailablePct: 1, swapActive: false })).toBe(false);
  });

  it('still uses the memory rule on a kernel without PSI', () => {
    // Act / Assert
    expect(isUnderLoad(undefined, { memAvailablePct: 2, swapActive: true })).toBe(true);
    expect(isUnderLoad(undefined, undefined)).toBe(false);
  });
});
