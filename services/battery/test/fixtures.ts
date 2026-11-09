import type { BatterySample } from '@yoman/shared/ingest';

/** A healthy, discharging laptop battery: 50 of 60 Wh design, at 10 W. */
export function batterySample(
  clock: string,
  overrides: Partial<BatterySample> = {},
): BatterySample {
  return {
    kind: 'battery',
    ts: `2026-11-08T${clock}:00.000Z`,
    energyFullWh: 54,
    energyFullDesignWh: 60,
    cycleCount: 312,
    powerW: 10,
    capacityPct: 50,
    status: 'discharging',
    ...overrides,
  };
}
