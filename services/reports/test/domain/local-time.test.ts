import { describe, expect, it } from 'vitest';

import {
  addDays,
  isTimeZone,
  localDateOf,
  splitByLocalDay,
  startOfLocalDay,
  weekdayOf,
} from '../../src/domain/local-time.js';

const JERUSALEM = 'Asia/Jerusalem';
const SAO_PAULO = 'America/Sao_Paulo';
const SUNDAY = 0;
const SATURDAY = 6;

function iso(tsMs: number): string {
  return new Date(tsMs).toISOString();
}

function between(start: string, end: string): number {
  return Date.parse(end) - Date.parse(start);
}

describe('isTimeZone', () => {
  it('accepts IANA zones and rejects anything else', () => {
    expect(isTimeZone(JERUSALEM)).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isTimeZone("UTC'; DROP TABLE daily_rollups; --")).toBe(false);
  });
});

describe('localDateOf', () => {
  it('puts an instant on the local day, not the UTC day', () => {
    // 23:30 UTC is already 01:30 the next morning in Jerusalem (UTC+2 in November).
    const ts = Date.parse('2026-11-08T23:30:00.000Z');

    expect(localDateOf(ts, 'UTC')).toBe('2026-11-08');
    expect(localDateOf(ts, JERUSALEM)).toBe('2026-11-09');
  });
});

describe('addDays and weekdayOf', () => {
  it('moves across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts weekdays from Sunday', () => {
    expect(weekdayOf('2026-11-08')).toBe(SUNDAY);
    expect(weekdayOf('2026-11-14')).toBe(SATURDAY);
  });
});

describe('startOfLocalDay', () => {
  it('is local midnight', () => {
    expect(iso(startOfLocalDay('2026-11-09', JERUSALEM))).toBe('2026-11-08T22:00:00.000Z');
  });

  it('is 01:00 on a day whose midnight a DST change skipped', () => {
    // Sao Paulo moved from 00:00 straight to 01:00 (UTC-3 to UTC-2) on 2018-11-04.
    expect(iso(startOfLocalDay('2018-11-04', SAO_PAULO))).toBe('2018-11-04T03:00:00.000Z');
  });

  it('is midnight on the day before a DST change repeats midnight', () => {
    // Sao Paulo moved from 00:00 back to 23:00 (UTC-2 to UTC-3) on 2019-02-17.
    expect(iso(startOfLocalDay('2019-02-16', SAO_PAULO))).toBe('2019-02-16T02:00:00.000Z');
  });
});

describe('splitByLocalDay', () => {
  it('splits a span that crosses local midnight into one slice per day', () => {
    const start = '2026-11-08T21:30:00.000Z'; // 23:30 in Jerusalem
    const midnight = '2026-11-08T22:00:00.000Z';
    const end = '2026-11-08T22:45:00.000Z'; // 00:45 the next day

    expect(splitByLocalDay(Date.parse(start), Date.parse(end), JERUSALEM)).toEqual([
      { date: '2026-11-08', ms: between(start, midnight) },
      { date: '2026-11-09', ms: between(midnight, end) },
    ]);
  });

  it('keeps a span inside one day whole', () => {
    const start = '2026-11-08T08:00:00.000Z';
    const end = '2026-11-08T09:00:00.000Z';

    expect(splitByLocalDay(Date.parse(start), Date.parse(end), JERUSALEM)).toEqual([
      { date: '2026-11-08', ms: between(start, end) },
    ]);
  });

  it('gives a span over a whole day a full middle slice', () => {
    const start = '2026-11-07T21:00:00.000Z';
    const end = '2026-11-09T23:00:00.000Z';

    expect(splitByLocalDay(Date.parse(start), Date.parse(end), 'UTC')).toEqual([
      { date: '2026-11-07', ms: between(start, '2026-11-08T00:00:00.000Z') },
      { date: '2026-11-08', ms: between('2026-11-08T00:00:00.000Z', '2026-11-09T00:00:00.000Z') },
      { date: '2026-11-09', ms: between('2026-11-09T00:00:00.000Z', end) },
    ]);
  });

  it('counts a 23-hour day when the clock springs forward', () => {
    // Jerusalem moved from 02:00 to 03:00 on 2026-03-27: UTC+2 at its start, UTC+3 at its end.
    const start = startOfLocalDay('2026-03-27', JERUSALEM);
    const end = startOfLocalDay('2026-03-28', JERUSALEM);

    expect(iso(start)).toBe('2026-03-26T22:00:00.000Z');
    expect(iso(end)).toBe('2026-03-27T21:00:00.000Z');
    expect(splitByLocalDay(start, end, JERUSALEM)).toEqual([
      { date: '2026-03-27', ms: end - start },
    ]);
  });

  it('has no slices for an empty span', () => {
    const ts = Date.parse('2026-11-08T08:00:00.000Z');

    expect(splitByLocalDay(ts, ts, JERUSALEM)).toEqual([]);
  });
});
