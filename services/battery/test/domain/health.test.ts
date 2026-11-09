import { describe, expect, it } from 'vitest';

import { healthPct } from '../../src/domain/health.js';

const DESIGN_WH = 50;
const HALF_WH = 25;
const HALF_PCT = 50;
const WORN_WH = 41.234;
const WORN_PCT = 82.5;
const ALL_PCT = 100;

describe('healthPct', () => {
  it('is energy_full over energy_full_design, in percent', () => {
    expect(healthPct(HALF_WH, DESIGN_WH)).toBe(HALF_PCT);
  });

  it('rounds to one decimal place', () => {
    expect(healthPct(WORN_WH, DESIGN_WH)).toBe(WORN_PCT);
  });

  it('caps a cell that holds more than its design energy at 100', () => {
    expect(healthPct(DESIGN_WH * 2, DESIGN_WH)).toBe(ALL_PCT);
  });

  it('is 0 for a cell that holds nothing', () => {
    expect(healthPct(0, DESIGN_WH)).toBe(0);
  });
});
