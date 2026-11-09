import { LIMITS } from '@yoman/shared/limits';

/** One decimal place: finer than sysfs energy readings are accurate. */
const HEALTH_PRECISION = 10;

/**
 * Battery health in percent: `energy_full / energy_full_design` (SPEC §5 battery).
 * A new cell can hold slightly more than its design energy; health is capped at
 * 100 so it stays a percentage.
 */
export function healthPct(energyFullWh: number, energyFullDesignWh: number): number {
  const ratio = (energyFullWh / energyFullDesignWh) * LIMITS.percent;
  const capped = Math.min(Math.max(ratio, 0), LIMITS.percent);
  return Math.round(capped * HEALTH_PRECISION) / HEALTH_PRECISION;
}
