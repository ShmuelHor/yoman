import type { BatteryDay } from '@yoman/shared/battery';

export interface MonthlyCycles {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly cycles: number;
}

const MONTH_LENGTH = 'YYYY-MM'.length;

/**
 * Charge cycles used per calendar month. The battery reports a running counter,
 * so a month's cycles are the counter's growth across it: the last value minus
 * the value before the month began. The first month of data has no earlier
 * value and counts from its own first day.
 */
export function cyclesPerMonth(days: readonly BatteryDay[]): MonthlyCycles[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const result: MonthlyCycles[] = [];
  let counter: number | undefined;
  let base = 0;
  for (const day of sorted) {
    const month = day.date.slice(0, MONTH_LENGTH);
    if (result.at(-1)?.month !== month) {
      base = counter ?? day.cycles;
      result.push({ month, cycles: 0 });
    }
    result[result.length - 1] = { month, cycles: Math.max(0, day.cycles - base) };
    counter = day.cycles;
  }
  return result;
}
