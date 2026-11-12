const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

export interface SplitDuration {
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
}

/** An incident's length split for the i18n duration keys; whole seconds, never negative. */
export function splitDuration(milliseconds: number): SplitDuration {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / MS_PER_SECOND));
  const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  return {
    hours: Math.floor(totalMinutes / MINUTES_PER_HOUR),
    minutes: totalMinutes % MINUTES_PER_HOUR,
    seconds: totalSeconds % SECONDS_PER_MINUTE,
  };
}

const BYTES_PER_MEGABYTE = 1_048_576;

/** Leak rates arrive in bytes per hour; a person reads megabytes. */
export function bytesToMegabytes(bytes: number): number {
  return bytes / BYTES_PER_MEGABYTE;
}
