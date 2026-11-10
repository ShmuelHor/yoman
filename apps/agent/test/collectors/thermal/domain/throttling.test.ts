import { describe, expect, it } from 'vitest';
import {
  isThrottled,
  parseThrottleCounts,
} from '../../../../src/collectors/thermal/domain/throttling.js';

const CORE = 'cpu0/thermal_throttle/core_throttle_count';
const PACKAGE = 'cpu0/thermal_throttle/package_throttle_count';
const IDLE_COOLING = ['0\n', '0\n'];

function counts(values: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(values));
}

describe('parseThrottleCounts', () => {
  it('keeps the well-formed counters and drops the rest', () => {
    // Arrange
    const files = new Map(
      Object.entries({
        [CORE]: '20178\n',
        [PACKAGE]: undefined,
        'cpu1/thermal_throttle/core_throttle_count': '-1\n',
        'cpu2/thermal_throttle/core_throttle_count': '1234567890123456\n',
      }),
    );

    // Act / Assert
    expect(parseThrottleCounts(files)).toEqual(counts({ [CORE]: 20_178 }));
  });
});

describe('isThrottled', () => {
  it('is throttled while a CPU cooling device is engaged', () => {
    // Act / Assert
    expect(
      isThrottled({ coolingStates: ['0\n', '2\n'], counts: new Map(), previousCounts: undefined }),
    ).toBe(true);
  });

  it('is throttled when a throttle counter went up since the last tick', () => {
    // Arrange
    const previousCounts = counts({ [CORE]: 10, [PACKAGE]: 4 });
    const current = counts({ [CORE]: 10, [PACKAGE]: 5 });

    // Act / Assert
    expect(isThrottled({ coolingStates: IDLE_COOLING, counts: current, previousCounts })).toBe(
      true,
    );
  });

  it('is not throttled when the counters stand still and cooling is idle', () => {
    // Arrange
    const current = counts({ [CORE]: 10 });

    // Act / Assert
    expect(
      isThrottled({ coolingStates: IDLE_COOLING, counts: current, previousCounts: current }),
    ).toBe(false);
  });

  it('does not count throttling from before the agent started', () => {
    // Arrange
    const current = counts({ [CORE]: 20_178 });

    // Act / Assert
    expect(
      isThrottled({ coolingStates: IDLE_COOLING, counts: current, previousCounts: undefined }),
    ).toBe(false);
  });

  it('ignores a counter that is new or went down, as after a CPU comes back online', () => {
    // Arrange
    const previousCounts = counts({ [CORE]: 10 });
    const current = counts({ [CORE]: 0, [PACKAGE]: 7 });

    // Act / Assert
    expect(isThrottled({ coolingStates: IDLE_COOLING, counts: current, previousCounts })).toBe(
      false,
    );
  });

  it('treats an unreadable or malformed cooling state as idle', () => {
    // Act / Assert
    expect(
      isThrottled({
        coolingStates: [undefined, 'busy\n'],
        counts: new Map(),
        previousCounts: undefined,
      }),
    ).toBe(false);
  });
});
