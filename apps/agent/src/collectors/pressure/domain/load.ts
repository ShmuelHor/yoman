import type { MemoryReading } from './memory.js';
import { PRESSURE_RESOURCES, type PressureReading, type PressureResource } from './pressure.js';

/**
 * The `some avg10` percentages above which the system service opens an
 * incident (SPEC §5 system defaults). The agent uses the same lines, so the
 * process snapshot that names the culprits exists whenever an incident does.
 */
export const LOAD_THRESHOLDS: Readonly<Record<PressureResource, number>> = {
  cpu: 40,
  memory: 10,
  io: 30,
};

/** Available memory below this share, with swap in use, is critical (SPEC §5 system). */
export const LOW_MEMORY_PCT = 5;

/**
 * Whether the machine is under load: any resource's `some avg10` exceeds its
 * threshold, or memory is nearly exhausted while swapping. Either reading may
 * be missing on a kernel without PSI; the other still counts.
 */
export function isUnderLoad(
  pressure: PressureReading | undefined,
  memory: MemoryReading | undefined,
): boolean {
  const stalled =
    pressure !== undefined &&
    PRESSURE_RESOURCES.some((resource) => pressure[resource].some > LOAD_THRESHOLDS[resource]);
  const exhausted = memory?.swapActive === true && memory.memAvailablePct < LOW_MEMORY_PCT;
  return stalled || exhausted;
}
