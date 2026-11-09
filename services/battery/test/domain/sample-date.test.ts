import { describe, expect, it } from 'vitest';

import { sampleDate, windowStart } from '../../src/domain/sample-date.js';

const MONTH_DAYS = 30;

describe('sampleDate', () => {
  it('takes the date in the offset the timestamp carries', () => {
    expect(sampleDate('2026-11-08T23:30:00.000Z')).toBe('2026-11-08');
    expect(sampleDate('2026-11-09T01:30:00+02:00')).toBe('2026-11-09');
  });
});

describe('windowStart', () => {
  it('starts a one-day window on the current date', () => {
    expect(windowStart(new Date('2026-11-08T10:00:00.000Z'), 1)).toBe('2026-11-08');
  });

  it('reaches back days minus one, across a month boundary', () => {
    expect(windowStart(new Date('2026-11-08T10:00:00.000Z'), MONTH_DAYS)).toBe('2026-10-10');
  });
});
