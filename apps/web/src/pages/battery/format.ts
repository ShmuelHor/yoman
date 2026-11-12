const MINUTES_PER_HOUR = 60;

/** `{ hours, minutes }` for the `duration` i18n key. */
export function splitMinutes(totalMinutes: number): { hours: number; minutes: number } {
  return {
    hours: Math.floor(totalMinutes / MINUTES_PER_HOUR),
    minutes: totalMinutes % MINUTES_PER_HOUR,
  };
}

/** The local calendar day of a `YYYY-MM-DD` string; parsing it as UTC would shift the label by a day. */
export function localDay(date: string): Date {
  return new Date(`${date}T00:00:00`);
}
