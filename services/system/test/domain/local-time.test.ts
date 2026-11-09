import { describe, expect, it } from 'vitest';

import {
  addDays,
  isTimeZone,
  localDateOf,
  localDaySpan,
  startOfLocalDay,
} from '../../src/domain/local-time.js';

const HOUR_MS = 3_600_000;
const LONG_DAY_HOURS = 25;

describe('local time', () => {
  it('recognizes IANA zones and rejects anything else', () => {
    expect(isTimeZone('Asia/Jerusalem')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone("UTC'; DROP TABLE incidents; --")).toBe(false);
  });

  it('finds the local date of an instant', () => {
    expect(localDateOf(Date.parse('2026-11-08T22:30:00Z'), 'Asia/Jerusalem')).toBe('2026-11-09');
    expect(localDateOf(Date.parse('2026-11-08T22:30:00Z'), 'UTC')).toBe('2026-11-08');
  });

  it('adds calendar days across a month end', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('starts a local day at local midnight', () => {
    expect(startOfLocalDay('2026-11-08', 'Asia/Jerusalem')).toBe(
      Date.parse('2026-11-07T22:00:00Z'),
    );
  });

  it('starts a day without a 00:00 at its first instant', () => {
    // Santiago moves its clock from 00:00 to 01:00 on 2026-09-06.
    expect(startOfLocalDay('2026-09-06', 'America/Santiago')).toBe(
      Date.parse('2026-09-06T04:00:00Z'),
    );
  });

  it('spans 25 hours on the day the clock moves back', () => {
    const { startMs, endMs } = localDaySpan('2026-10-25', 'Europe/London');

    expect((endMs - startMs) / HOUR_MS).toBe(LONG_DAY_HOURS);
  });
});
