const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/** `{ hours, minutes }` rounded down to whole minutes, for the `duration` i18n key. */
export function splitDuration(seconds: number): { hours: number; minutes: number } {
  const totalMinutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  return {
    hours: Math.floor(totalMinutes / MINUTES_PER_HOUR),
    minutes: totalMinutes % MINUTES_PER_HOUR,
  };
}
