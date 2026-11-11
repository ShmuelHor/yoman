/** 2024-01-07 was a Sunday, so day `n` is the `n`th day after it. Weekday 0 is Sunday, as in the contract. */
const SUNDAY_YEAR = 2024;
const JANUARY = 0;
const SUNDAY_DATE = 7;

const DAYS_PER_WEEK = 7;

/** Every weekday in week order, Sunday (0) first. */
export const WEEK: readonly number[] = Array.from({ length: DAYS_PER_WEEK }, (_, day) => day);

/** The localized name of a weekday (`0` is Sunday), through `Intl` so it follows the language. */
export function weekdayName(day: number, language: string, width: 'short' | 'long'): string {
  const date = new Date(Date.UTC(SUNDAY_YEAR, JANUARY, SUNDAY_DATE + day));
  return new Intl.DateTimeFormat(language, { weekday: width, timeZone: 'UTC' }).format(date);
}

/** The scheduled days as one line, in week order: "Sun, Mon, Tue". */
export function weekdaySummary(days: readonly number[], language: string): string {
  const formatter = new Intl.ListFormat(language, { style: 'narrow', type: 'unit' });
  return formatter.format(
    [...days].sort((a, b) => a - b).map((day) => weekdayName(day, language, 'short')),
  );
}
