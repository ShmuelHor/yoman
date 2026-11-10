import { LIMITS } from '@yoman/shared/limits';
import { z } from 'zod';

/** sysfs reports temperatures in millidegrees Celsius. */
const MILLIDEGREES_PER_DEGREE = 1_000;
/** One decimal: finer than the 95 °C alert line needs (SPEC §5). */
const PRECISION = 10;

/**
 * One temperature attribute (`temp` or `temp*_input`). Seven digits cover
 * the contract's range; drivers that report an unplugged or failed sensor
 * as -273 °C or 255 °C fall outside it and are dropped.
 */
const Millidegrees = z
  .string()
  .trim()
  .regex(/^-?\d{1,7}$/)
  .transform((value) => Number(value) / MILLIDEGREES_PER_DEGREE)
  .pipe(z.number().gt(-LIMITS.celsius).lt(LIMITS.celsius));

/** Parses a temperature attribute into °C; `undefined` when malformed or out of range. */
export function parseCelsius(text: string): number | undefined {
  const result = Millidegrees.safeParse(text);
  return result.success ? result.data : undefined;
}

/**
 * The CPU temperature from every CPU sensor's raw reading: the hottest one,
 * since one hot core is what slows the whole package down. Unreadable and
 * malformed readings are skipped. Returns `undefined` when none is usable.
 */
export function cpuTemperature(readings: readonly (string | undefined)[]): number | undefined {
  const values = readings.flatMap((reading) => {
    const celsius = reading === undefined ? undefined : parseCelsius(reading);
    return celsius === undefined ? [] : [celsius];
  });
  if (values.length === 0) {
    return undefined;
  }
  return Math.round(Math.max(...values) * PRECISION) / PRECISION;
}
