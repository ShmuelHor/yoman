import { describe, expect, it } from 'vitest';

import { dayBounds, isFuture, shiftDate } from '../../../src/pages/system/day.js';

const NOW = new Date('2026-11-08T12:00:00');

describe('day helpers', () => {
  it('moves to the previous and the next day across a month edge', () => {
    expect(shiftDate('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('treats only a later day as the future', () => {
    expect(isFuture('2026-11-08', NOW)).toBe(false);
    expect(isFuture('2026-11-09', NOW)).toBe(true);
  });

  it('spans the whole local day', () => {
    const { start, end } = dayBounds('2026-11-08');

    expect(start).toEqual(new Date('2026-11-08T00:00:00'));
    expect(end.getTime()).toBeGreaterThan(new Date('2026-11-08T23:59:59').getTime());
    expect(end.getTime()).toBeLessThan(new Date('2026-11-09T00:00:00').getTime());
  });
});
