import { describe, expect, it } from 'vitest';

import { addDays, isTimeZone, localDateOf } from '../../src/domain/local-time.js';

const JERUSALEM = 'Asia/Jerusalem';

describe('isTimeZone', () => {
  it('accepts IANA zones and rejects anything else', () => {
    expect(isTimeZone(JERUSALEM)).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isTimeZone("UTC'; DROP TABLE battery_daily; --")).toBe(false);
  });
});

describe('localDateOf', () => {
  it('puts an instant on the local day, not the UTC day', () => {
    // 23:30 UTC is already 01:30 the next morning in Jerusalem (UTC+2 in November).
    const ts = Date.parse('2026-11-08T23:30:00.000Z');

    expect(localDateOf(ts, 'UTC')).toBe('2026-11-08');
    expect(localDateOf(ts, JERUSALEM)).toBe('2026-11-09');
  });

  it('follows a daylight saving change', () => {
    // Jerusalem is UTC+3 in summer: 21:30 UTC is 00:30 the next day.
    expect(localDateOf(Date.parse('2026-07-01T21:30:00.000Z'), JERUSALEM)).toBe('2026-07-02');
  });
});

describe('addDays', () => {
  it('moves across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
