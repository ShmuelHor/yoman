import type { BatteryStatus } from '@yoman/shared/ingest';
import { describe, expect, it } from 'vitest';

import type { PowerReading } from '../../src/domain/reading.js';
import { minutesRemaining } from '../../src/domain/time-remaining.js';

const DRAW_W = 15;
/** 30 Wh left (half of 60 Wh) at 15 W lasts two hours. */
const AT_DRAW_MINUTES = 120;
const A_WEEK_MINUTES = 10_080;
const TRICKLE_W = 0.01;
const CHARGE_W = 40;

/** A wall-clock time on the fixture day, `HH:MM` in UTC. */
function at(clock: string): number {
  return Date.parse(`2026-11-08T${clock}:00.000Z`);
}

function reading(
  clock: string,
  powerW: number,
  status: BatteryStatus = 'discharging',
): PowerReading {
  return { tsMs: at(clock), powerW, status };
}

const latest = {
  tsMs: at('10:00'),
  status: 'discharging' as const,
  capacityPct: 50,
  energyFullWh: 60,
};

describe('minutesRemaining', () => {
  it('divides the energy left by the average draw of the last 30 minutes', () => {
    const readings = [
      reading('09:40', DRAW_W - 2),
      reading('09:50', DRAW_W + 2),
      reading('10:00', DRAW_W),
    ];

    expect(minutesRemaining(latest, readings)).toBe(AT_DRAW_MINUTES);
  });

  it('ignores readings from before the window', () => {
    const readings = [reading('09:30', CHARGE_W), reading('10:00', DRAW_W)];

    expect(minutesRemaining(latest, readings)).toBe(AT_DRAW_MINUTES);
  });

  it('ignores readings taken on the charger', () => {
    const readings = [reading('09:55', CHARGE_W, 'charging'), reading('10:00', DRAW_W)];

    expect(minutesRemaining(latest, readings)).toBe(AT_DRAW_MINUTES);
  });

  it.each(['charging', 'full', 'not-charging', 'unknown'] as const)(
    'is null while the battery is %s',
    (status) => {
      expect(minutesRemaining({ ...latest, status }, [reading('10:00', DRAW_W)])).toBeNull();
    },
  );

  it('is null when no draw was measured', () => {
    expect(minutesRemaining(latest, [reading('10:00', 0)])).toBeNull();
    expect(minutesRemaining(latest, [])).toBeNull();
  });

  it('caps the estimate at a week', () => {
    expect(minutesRemaining(latest, [reading('10:00', TRICKLE_W)])).toBe(A_WEEK_MINUTES);
  });
});
