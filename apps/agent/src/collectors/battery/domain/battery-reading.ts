import type { BatteryStatus } from '@yoman/shared/ingest';
import { z } from 'zod';

/** The sysfs attributes of one `power_supply/BAT*` device the collector reads. */
export const BATTERY_ATTRIBUTES = [
  'present',
  'status',
  'capacity',
  'cycle_count',
  'energy_full',
  'energy_full_design',
  'power_now',
  'charge_full',
  'charge_full_design',
  'current_now',
  'voltage_now',
  'voltage_min_design',
] as const;
export type BatteryAttribute = (typeof BATTERY_ATTRIBUTES)[number];

/** Raw attribute contents; a missing file is `undefined`, since drivers expose different subsets. */
export type BatteryFiles = { readonly [A in BatteryAttribute]?: string | undefined };

/** One battery in SI units: energy in Wh, power in W. */
export interface BatteryReading {
  readonly energyFullWh: number;
  readonly energyFullDesignWh: number;
  readonly cycleCount: number;
  readonly powerW: number;
  readonly capacityPct: number;
  readonly status: BatteryStatus;
}

/** sysfs reports µWh, µW, µAh, µA and µV. */
const MICRO = 1e6;
const MAX_PERCENT = 100;
/** Fifteen digits stay inside `Number.MAX_SAFE_INTEGER`. */
const SysfsInteger = z
  .string()
  .trim()
  .regex(/^-?\d{1,15}$/)
  .transform(Number);

const STATUS_BY_SYSFS: Readonly<Record<string, BatteryStatus>> = {
  Charging: 'charging',
  Discharging: 'discharging',
  Full: 'full',
  'Not charging': 'not-charging',
};

function integer(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const result = SysfsInteger.safeParse(value);
  return result.success ? result.data : undefined;
}

/** µWh, or µAh times µV (both micro), into Wh. */
function energyWh(
  energy: number | undefined,
  charge: number | undefined,
  voltage: number | undefined,
): number | undefined {
  if (energy !== undefined) {
    return energy / MICRO;
  }
  if (charge !== undefined && voltage !== undefined) {
    return (charge / MICRO) * (voltage / MICRO);
  }
  return undefined;
}

/** Some drivers report a signed rate (negative while discharging); the sample carries magnitude. */
function powerW(files: BatteryFiles): number {
  const power = integer(files.power_now);
  if (power !== undefined) {
    return Math.abs(power) / MICRO;
  }
  const current = integer(files.current_now);
  const voltage = integer(files.voltage_now);
  if (current !== undefined && voltage !== undefined) {
    return (Math.abs(current) / MICRO) * (voltage / MICRO);
  }
  return 0;
}

function status(value: string | undefined): BatteryStatus {
  return STATUS_BY_SYSFS[value?.trim() ?? ''] ?? 'unknown';
}

/**
 * Turns one battery's sysfs attributes into a reading. Energy comes from
 * `energy_*` or, on drivers that only expose charge, from `charge_*` times the
 * design voltage. Returns `undefined` when the battery is absent or the
 * attributes needed for health are missing or malformed.
 */
export function parseBatteryReading(files: BatteryFiles): BatteryReading | undefined {
  if (files.present?.trim() === '0') {
    return undefined;
  }
  const voltage = integer(files.voltage_min_design) ?? integer(files.voltage_now);
  const full = energyWh(integer(files.energy_full), integer(files.charge_full), voltage);
  const design = energyWh(
    integer(files.energy_full_design),
    integer(files.charge_full_design),
    voltage,
  );
  const capacity = integer(files.capacity);
  if (full === undefined || design === undefined || capacity === undefined) {
    return undefined;
  }
  if (full < 0 || design <= 0) {
    return undefined;
  }
  return {
    energyFullWh: full,
    energyFullDesignWh: design,
    // Drivers without cycle counting expose 0 or nothing; both mean "unknown".
    cycleCount: Math.max(0, integer(files.cycle_count) ?? 0),
    powerW: powerW(files),
    capacityPct: Math.min(MAX_PERCENT, Math.max(0, capacity)),
    status: status(files.status),
  };
}
