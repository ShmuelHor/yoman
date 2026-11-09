import { describe, expect, it } from 'vitest';
import {
  type BatteryFiles,
  parseBatteryReading,
} from '../../../../src/collectors/battery/domain/battery-reading.js';

/** A typical ThinkPad battery with energy attributes, as sysfs writes them. */
const ENERGY_BATTERY: BatteryFiles = {
  present: '1\n',
  status: 'Discharging\n',
  capacity: '76\n',
  cycle_count: '312\n',
  energy_full: '45120000\n',
  energy_full_design: '57020000\n',
  power_now: '8450000\n',
};

describe('parseBatteryReading', () => {
  it('converts energy attributes from micro units to Wh and W', () => {
    // Act
    const reading = parseBatteryReading(ENERGY_BATTERY);

    // Assert
    expect(reading).toEqual({
      energyFullWh: 45.12,
      energyFullDesignWh: 57.02,
      cycleCount: 312,
      powerW: 8.45,
      capacityPct: 76,
      status: 'discharging',
    });
  });

  it('derives energy from charge and the design voltage when energy is missing', () => {
    // Arrange: 4 Ah at 11.4 V, and 1.5 A at 12 V.
    const files: BatteryFiles = {
      status: 'Charging',
      capacity: '50',
      charge_full: '4000000',
      charge_full_design: '5000000',
      voltage_min_design: '11400000',
      voltage_now: '12000000',
      current_now: '1500000',
    };

    // Act
    const reading = parseBatteryReading(files);

    // Assert
    expect(reading).toMatchObject({
      energyFullWh: 45.6,
      energyFullDesignWh: 57,
      powerW: 18,
      status: 'charging',
    });
  });

  it('falls back to the current voltage when the design voltage is missing', () => {
    // Arrange
    const files: BatteryFiles = {
      capacity: '50',
      charge_full: '1000000',
      charge_full_design: '2000000',
      voltage_now: '10000000',
    };

    // Act
    const reading = parseBatteryReading(files);

    // Assert
    expect(reading).toMatchObject({
      energyFullWh: 10,
      energyFullDesignWh: 20,
    });
  });

  it('reports the magnitude of a signed discharge rate', () => {
    // Act
    const reading = parseBatteryReading({ ...ENERGY_BATTERY, power_now: '-7000000' });

    // Assert
    expect(reading).toMatchObject({ powerW: 7 });
  });

  it('reports zero power and zero cycles when the driver does not expose them', () => {
    // Arrange
    const { power_now: _power, cycle_count: _cycles, ...files } = ENERGY_BATTERY;

    // Act
    const reading = parseBatteryReading(files);

    // Assert
    expect(reading?.powerW).toBe(0);
    expect(reading?.cycleCount).toBe(0);
  });

  it.each([
    ['Full', 'full'],
    ['Not charging', 'not-charging'],
    ['Unknown', 'unknown'],
    ['Something new', 'unknown'],
  ] as const)('maps the sysfs status %s to %s', (sysfs, expected) => {
    // Act
    const reading = parseBatteryReading({ ...ENERGY_BATTERY, status: `${sysfs}\n` });

    // Assert
    expect(reading?.status).toBe(expected);
  });

  it('treats a missing status as unknown', () => {
    // Arrange
    const { status: _status, ...files } = ENERGY_BATTERY;

    // Act / Assert
    expect(parseBatteryReading(files)?.status).toBe('unknown');
  });

  it('clamps a capacity above 100% from a buggy driver', () => {
    // Act / Assert
    expect(parseBatteryReading({ ...ENERGY_BATTERY, capacity: '104' })).toMatchObject({
      capacityPct: 100,
    });
  });

  it('skips a battery that is not present', () => {
    // Act / Assert
    expect(parseBatteryReading({ ...ENERGY_BATTERY, present: '0\n' })).toBeUndefined();
  });

  it.each([
    ['energy_full', { energy_full: undefined }],
    ['energy_full_design', { energy_full_design: undefined }],
    ['capacity', { capacity: undefined }],
  ] as const)('skips a battery without %s', (_name, override) => {
    // Act / Assert
    expect(parseBatteryReading({ ...ENERGY_BATTERY, ...override })).toBeUndefined();
  });

  it('skips a battery whose design energy is zero, since health would divide by it', () => {
    // Act / Assert
    expect(parseBatteryReading({ ...ENERGY_BATTERY, energy_full_design: '0' })).toBeUndefined();
  });

  it('skips a battery with a negative full energy', () => {
    // Act / Assert
    expect(parseBatteryReading({ ...ENERGY_BATTERY, energy_full: '-1' })).toBeUndefined();
  });

  it.each(['garbage', '12.5', '1e9', '9999999999999999', ''])(
    'rejects the malformed number %j',
    (value) => {
      // Act / Assert
      expect(parseBatteryReading({ ...ENERGY_BATTERY, energy_full: value })).toBeUndefined();
    },
  );
});
