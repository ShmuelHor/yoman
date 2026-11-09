import type { PressureSample, ThermalSample } from '@yoman/shared/ingest';
import type { Settings } from '@yoman/shared/settings';

import type { ConditionPoint, ConditionRule } from './condition-tracker.js';

/** `some avg10` must exceed its threshold for more than this to open an incident (SPEC §5 system). */
export const PRESSURE_SUSTAIN_MS = 15_000;

/** Available memory below this, with swap in use, is close to OOM (SPEC §5 system). */
export const CRITICAL_MEMORY_AVAILABLE_PCT = 5;

/** A CPU above this temperature is overheating (SPEC §5 system). */
export const THERMAL_LIMIT_C = 95;

export type PressureThresholds = Settings['thresholds'];

/** Every incident type a sample condition opens; memory leaks come from process history instead. */
export type ConditionType = 'cpu' | 'memory' | 'io' | 'memory-critical' | 'thermal';

export const CONDITION_TYPES: readonly ConditionType[] = [
  'cpu',
  'memory',
  'io',
  'memory-critical',
  'thermal',
];

/** Pressure must be sustained; near-OOM and overheating matter from the first sample. */
export const CONDITION_RULES: Readonly<Record<ConditionType, ConditionRule>> = {
  cpu: { type: 'cpu', sustainMs: PRESSURE_SUSTAIN_MS },
  memory: { type: 'memory', sustainMs: PRESSURE_SUSTAIN_MS },
  io: { type: 'io', sustainMs: PRESSURE_SUSTAIN_MS },
  'memory-critical': { type: 'memory-critical', sustainMs: null },
  thermal: { type: 'thermal', sustainMs: null },
};

type PressureResource = 'cpu' | 'memory' | 'io';

function pressurePoint(
  sample: PressureSample,
  resource: PressureResource,
  thresholds: PressureThresholds,
): ConditionPoint {
  const value = sample[resource].some;
  return { tsMs: Date.parse(sample.ts), active: value > thresholds[resource], value };
}

/** The near-OOM peak is the memory pressure it caused, like the other pressure incidents. */
function criticalMemoryPoint(sample: PressureSample): ConditionPoint {
  return {
    tsMs: Date.parse(sample.ts),
    active: sample.memAvailablePct < CRITICAL_MEMORY_AVAILABLE_PCT && sample.swapActive,
    value: sample.memory.some,
  };
}

/** The peak is in °C; a throttled CPU below 0 °C still has a non-negative peak. */
function thermalPoint(sample: ThermalSample): ConditionPoint {
  return {
    tsMs: Date.parse(sample.ts),
    active: sample.cpuTempC > THERMAL_LIMIT_C || sample.throttled,
    value: Math.max(0, sample.cpuTempC),
  };
}

/** The points of every condition, in the order of the samples given. */
export function conditionPoints(
  pressure: readonly PressureSample[],
  thermal: readonly ThermalSample[],
  thresholds: PressureThresholds,
): Record<ConditionType, ConditionPoint[]> {
  return {
    cpu: pressure.map((sample) => pressurePoint(sample, 'cpu', thresholds)),
    memory: pressure.map((sample) => pressurePoint(sample, 'memory', thresholds)),
    io: pressure.map((sample) => pressurePoint(sample, 'io', thresholds)),
    'memory-critical': pressure.map(criticalMemoryPoint),
    thermal: thermal.map(thermalPoint),
  };
}
