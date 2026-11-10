import { z } from 'zod';

/** A cooling state or throttle counter; 15 digits stay inside `Number.MAX_SAFE_INTEGER`. */
const SysfsCounter = z
  .string()
  .trim()
  .regex(/^\d{1,15}$/)
  .transform(Number);

function counter(text: string | undefined): number | undefined {
  if (text === undefined) {
    return undefined;
  }
  const result = SysfsCounter.safeParse(text);
  return result.success ? result.data : undefined;
}

/** Raw throttle counters by file path; an unreadable file is `undefined`. */
export type ThrottleCounterFiles = ReadonlyMap<string, string | undefined>;
/** Parsed throttle counters by file path. */
export type ThrottleCounts = ReadonlyMap<string, number>;

/** Parses the readable, well-formed counters and drops the rest. */
export function parseThrottleCounts(files: ThrottleCounterFiles): ThrottleCounts {
  const counts = new Map<string, number>();
  for (const [path, text] of files) {
    const value = counter(text);
    if (value !== undefined) {
      counts.set(path, value);
    }
  }
  return counts;
}

export interface ThrottleEvidence {
  /** `cur_state` of every CPU cooling device. */
  readonly coolingStates: readonly (string | undefined)[];
  readonly counts: ThrottleCounts;
  /** The counts from the previous tick; `undefined` on the first one. */
  readonly previousCounts: ThrottleCounts | undefined;
}

/**
 * Whether the CPU was throttled for heat since the last tick. Either the
 * kernel's thermal framework has a CPU cooling device engaged right now, or
 * the CPU itself throttled since the previous reading: Intel counts every
 * hardware throttle event per core and per package, and those counters only
 * go up. On the first tick there is nothing to compare the counters with.
 */
export function isThrottled(evidence: ThrottleEvidence): boolean {
  const cooling = evidence.coolingStates.some((state) => (counter(state) ?? 0) > 0);
  if (cooling) {
    return true;
  }
  const previous = evidence.previousCounts;
  if (previous === undefined) {
    return false;
  }
  for (const [path, count] of evidence.counts) {
    const before = previous.get(path);
    if (before !== undefined && count > before) {
      return true;
    }
  }
  return false;
}
