import type { BatterySample, BatteryStatus } from '@yoman/shared/ingest';
import type { BatteryReading } from './battery-reading.js';

/** Three decimals: mWh and mW, finer than any driver reports. */
const PRECISION = 1_000;

function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

function sum(readings: readonly BatteryReading[], pick: (r: BatteryReading) => number): number {
  return readings.reduce((total, reading) => total + pick(reading), 0);
}

/**
 * The status of the whole pack: the laptop is discharging if any battery is,
 * and full only when every battery is.
 */
function combinedStatus(statuses: readonly BatteryStatus[]): BatteryStatus {
  if (statuses.includes('discharging')) {
    return 'discharging';
  }
  if (statuses.includes('charging')) {
    return 'charging';
  }
  if (statuses.every((status) => status === 'full')) {
    return 'full';
  }
  if (statuses.includes('not-charging')) {
    return 'not-charging';
  }
  return 'unknown';
}

/** Charge level weighted by each battery's size, so a small battery does not skew it. */
function combinedCapacity(readings: readonly BatteryReading[], energyFullWh: number): number {
  if (energyFullWh === 0) {
    return sum(readings, (r) => r.capacityPct) / readings.length;
  }
  return sum(readings, (r) => r.capacityPct * r.energyFullWh) / energyFullWh;
}

/**
 * Combines the readings of every battery (some laptops have two) into one
 * sample for the pack, the way the desktop shows a single battery. Energy and
 * power add up, so the health ratio stays meaningful; cycles are the most worn
 * battery's. Returns `undefined` for an empty list.
 */
export function combineReadings(
  readings: readonly BatteryReading[],
  ts: string,
): BatterySample | undefined {
  if (readings.length === 0) {
    return undefined;
  }
  const energyFullWh = sum(readings, (r) => r.energyFullWh);
  return {
    kind: 'battery',
    ts,
    energyFullWh: round(energyFullWh),
    energyFullDesignWh: round(sum(readings, (r) => r.energyFullDesignWh)),
    cycleCount: Math.max(...readings.map((r) => r.cycleCount)),
    powerW: round(sum(readings, (r) => r.powerW)),
    capacityPct: round(combinedCapacity(readings, energyFullWh)),
    status: combinedStatus(readings.map((r) => r.status)),
  };
}
