import { describe, expect, it } from 'vitest';

import { WEEK, weekdayName, weekdaySummary } from '../../../src/pages/goals/weekdays.js';

const SUNDAY = 0;
const MONDAY = 1;
const WEDNESDAY = 3;
const SATURDAY = 6;

describe('weekdays', () => {
  it('starts the week on Sunday', () => {
    expect(weekdayName(SUNDAY, 'en', 'long')).toBe('Sunday');
    expect(weekdayName(SATURDAY, 'en', 'long')).toBe('Saturday');
  });

  it('names weekdays in the given language', () => {
    expect(weekdayName(SUNDAY, 'he', 'long')).not.toBe(weekdayName(SUNDAY, 'en', 'long'));
  });

  it('covers every day from Sunday to Saturday', () => {
    expect(WEEK[0]).toBe(SUNDAY);
    expect(WEEK.at(-1)).toBe(SATURDAY);
    expect(WEEK).toHaveLength(SATURDAY + 1);
  });

  it('lists days in week order whatever order they are given in', () => {
    expect(weekdaySummary([WEDNESDAY, SUNDAY, MONDAY], 'en')).toBe('Sun Mon Wed');
  });
});
