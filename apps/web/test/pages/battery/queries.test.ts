import { describe, expect, it } from 'vitest';

import { rangeOfDays } from '../../../src/pages/battery/queries.js';

const MS_PER_DAY = 86_400_000;
const MONTH = 30;

describe('rangeOfDays', () => {
  it('covers whole local days, today included', () => {
    const range = rangeOfDays(MONTH, new Date('2026-11-08T12:34:00'));

    expect(new Date(range.to).getTime() - new Date(range.from).getTime()).toBeGreaterThanOrEqual(
      (MONTH - 1) * MS_PER_DAY,
    );
    expect(new Date(range.to)).toEqual(new Date('2026-11-09T00:00:00'));
  });

  it('does not change within a day', () => {
    expect(rangeOfDays(MONTH, new Date('2026-11-08T01:00:00'))).toEqual(
      rangeOfDays(MONTH, new Date('2026-11-08T23:00:00')),
    );
  });
});
