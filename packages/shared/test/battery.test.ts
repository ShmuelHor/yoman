import { describe, expect, it } from 'vitest';
import { BatteryNow, HealthTrend, HealthTrendQuery, PowerByApp } from '../src/battery.js';

const now = {
  ts: '2026-11-08T10:00:00Z',
  capacityPct: 81,
  status: 'discharging',
  powerW: 7.4,
  minutesRemaining: 290,
  healthPct: 84.6,
};

describe('battery', () => {
  it('accepts now, a trend, power by app and a trend query from a query string', () => {
    expect(BatteryNow.safeParse(now).success).toBe(true);
    expect(BatteryNow.safeParse({ ...now, minutesRemaining: null }).success).toBe(true);
    expect(
      HealthTrend.safeParse({
        items: [{ date: '2026-11-08', healthPct: 84.6, cycles: 312, averageW: 8.1 }],
      }).success,
    ).toBe(true);
    expect(
      PowerByApp.safeParse({ items: [{ appId: 'firefox', averageW: 9.2, seconds: 3600 }] }).success,
    ).toBe(true);
    expect(HealthTrendQuery.parse({ days: '30' })).toEqual({ days: 30 });
  });

  it('rejects out-of-range values and queries', () => {
    expect(BatteryNow.safeParse({ ...now, healthPct: 120 }).success).toBe(false);
    expect(BatteryNow.safeParse({ ...now, status: 'exploding' }).success).toBe(false);
    expect(HealthTrendQuery.safeParse({ days: '0' }).success).toBe(false);
    expect(HealthTrendQuery.safeParse({ days: '366' }).success).toBe(false);
    expect(HealthTrendQuery.safeParse({ days: 'abc' }).success).toBe(false);
    expect(HealthTrendQuery.safeParse({ days: '1.5' }).success).toBe(false);
  });
});
