import { BatterySample } from '@yoman/shared/ingest';
import { describe, expect, it } from 'vitest';
import type { BatteryReading } from '../../../../src/collectors/battery/domain/battery-reading.js';
import { combineReadings } from '../../../../src/collectors/battery/domain/combine-readings.js';

const TS = '2026-11-09T08:00:00.000Z';

const INTERNAL: BatteryReading = {
  energyFullWh: 20,
  energyFullDesignWh: 24,
  cycleCount: 120,
  powerW: 3,
  capacityPct: 90,
  status: 'discharging',
};

const EXTERNAL: BatteryReading = {
  energyFullWh: 60,
  energyFullDesignWh: 72,
  cycleCount: 300,
  powerW: 5,
  capacityPct: 50,
  status: 'not-charging',
};

describe('combineReadings', () => {
  it('turns a single battery into a valid sample', () => {
    // Act
    const sample = combineReadings([INTERNAL], TS);

    // Assert
    expect(sample).toEqual({ kind: 'battery', ts: TS, ...INTERNAL });
    expect(BatterySample.safeParse(sample).success).toBe(true);
  });

  it('adds up energy and power and keeps the most worn battery cycles', () => {
    // Act
    const sample = combineReadings([INTERNAL, EXTERNAL], TS);

    // Assert
    expect(sample).toMatchObject({
      energyFullWh: 80,
      energyFullDesignWh: 96,
      powerW: 8,
      cycleCount: 300,
    });
  });

  it('weights the charge level by each battery size', () => {
    // Act
    const sample = combineReadings([INTERNAL, EXTERNAL], TS);

    // Assert: (90 × 20 + 50 × 60) / 80
    expect(sample).toMatchObject({ capacityPct: 60 });
  });

  it('averages the charge level when no battery holds any energy', () => {
    // Arrange
    const dead = { ...INTERNAL, energyFullWh: 0, capacityPct: 0 };

    // Act
    const sample = combineReadings([dead, { ...dead, capacityPct: 10 }], TS);

    // Assert
    expect(sample).toMatchObject({ capacityPct: 5 });
  });

  it('rounds to three decimals', () => {
    // Act
    const sample = combineReadings([{ ...INTERNAL, powerW: 1.23456, energyFullWh: 9.87654 }], TS);

    // Assert
    expect(sample).toMatchObject({ powerW: 1.235, energyFullWh: 9.877 });
  });

  it.each([
    [['discharging', 'charging'], 'discharging'],
    [['charging', 'full'], 'charging'],
    [['full', 'full'], 'full'],
    [['full', 'not-charging'], 'not-charging'],
    [['full', 'unknown'], 'unknown'],
    [['unknown'], 'unknown'],
  ] as const)('combines the statuses %j into %s', (statuses, expected) => {
    // Arrange
    const readings = statuses.map((status) => ({ ...INTERNAL, status }));

    // Act / Assert
    expect(combineReadings(readings, TS)?.status).toBe(expected);
  });

  it('returns nothing for no batteries', () => {
    // Act / Assert
    expect(combineReadings([], TS)).toBeUndefined();
  });
});
