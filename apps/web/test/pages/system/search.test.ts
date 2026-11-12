import { describe, expect, it } from 'vitest';

import { DEFAULT_RANGE_DAYS, localDate, SystemSearch } from '../../../src/pages/system/search.js';

const WEEK = 7;
const OUT_OF_RANGE = 5_000;

describe('SystemSearch', () => {
  it('defaults to today and the default range when the URL has none', () => {
    expect(SystemSearch.parse({})).toEqual({
      date: localDate(new Date()),
      days: DEFAULT_RANGE_DAYS,
    });
  });

  it('keeps a valid day and range', () => {
    expect(SystemSearch.parse({ date: '2026-11-01', days: WEEK })).toEqual({
      date: '2026-11-01',
      days: WEEK,
    });
  });

  it.each(['yesterday', '2026-13-45', '', null])(
    'falls back to today for a hand-edited date %s',
    (date) => {
      expect(SystemSearch.parse({ date }).date).toBe(localDate(new Date()));
    },
  );

  it.each([OUT_OF_RANGE, -1, 'many', null])('falls back on a hand-edited range %s', (days) => {
    expect(SystemSearch.parse({ days }).days).toBe(DEFAULT_RANGE_DAYS);
  });
});
