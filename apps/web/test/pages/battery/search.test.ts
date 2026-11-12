import { describe, expect, it } from 'vitest';

import { BatterySearch, DEFAULT_RANGE_DAYS } from '../../../src/pages/battery/search.js';

const WEEK = 7;
const OUT_OF_RANGE = 5_000;

describe('BatterySearch', () => {
  it('defaults when the URL has no range', () => {
    expect(BatterySearch.parse({})).toEqual({ days: DEFAULT_RANGE_DAYS });
  });

  it('keeps an offered range', () => {
    expect(BatterySearch.parse({ days: WEEK })).toEqual({ days: WEEK });
  });

  it.each([OUT_OF_RANGE, -1, 'many', null])('falls back on a hand-edited value %s', (days) => {
    expect(BatterySearch.parse({ days })).toEqual({ days: DEFAULT_RANGE_DAYS });
  });
});
