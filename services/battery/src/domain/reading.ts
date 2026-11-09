import type { BatteryStatus } from '@yoman/shared/ingest';

/** One stored sample, as far as the power calculations need it. */
export interface PowerReading {
  readonly tsMs: number;
  readonly powerW: number;
  readonly status: BatteryStatus;
}

/**
 * `power_now` means drain only while discharging; on the charger it is the
 * charge rate, so every power average counts discharging readings alone.
 */
export function isDraining(reading: PowerReading): boolean {
  return reading.status === 'discharging';
}
