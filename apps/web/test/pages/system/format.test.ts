import { describe, expect, it } from 'vitest';

import { bytesToMegabytes, splitDuration } from '../../../src/pages/system/format.js';

const TWO_AND_A_HALF_MINUTES_MS = 150_000;
const OVER_AN_HOUR_MS = 3_725_000;
const TWO_GIB = 2_147_483_648;
const TWO_GIB_IN_MB = 2048;

describe('splitDuration', () => {
  it('splits minutes and seconds', () => {
    expect(splitDuration(TWO_AND_A_HALF_MINUTES_MS)).toEqual({ hours: 0, minutes: 2, seconds: 30 });
  });

  it('splits hours', () => {
    expect(splitDuration(OVER_AN_HOUR_MS)).toEqual({ hours: 1, minutes: 2, seconds: 5 });
  });

  it('never goes negative', () => {
    expect(splitDuration(-1)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });
});

describe('bytesToMegabytes', () => {
  it('converts with binary megabytes', () => {
    expect(bytesToMegabytes(TWO_GIB)).toBe(TWO_GIB_IN_MB);
  });
});
