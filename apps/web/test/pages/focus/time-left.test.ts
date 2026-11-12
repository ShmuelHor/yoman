import { describe, expect, it } from 'vitest';

import { minutesLeft } from '../../../src/pages/focus/time-left.js';

const NOW = new Date('2026-11-08T10:00:00.000Z');

describe('minutesLeft', () => {
  it('rounds a partial minute up', () => {
    expect(minutesLeft('2026-11-08T10:00:30.000Z', NOW)).toBe(1);
  });

  it('never goes below zero', () => {
    expect(minutesLeft('2026-11-08T09:00:00.000Z', NOW)).toBe(0);
  });
});
