import type { BatteryDay } from '@yoman/shared/battery';
import { describe, expect, it } from 'vitest';

import { cyclesPerMonth } from '../../../src/pages/battery/cycles.js';

const OCT_FIRST = 300;
const OCT_LAST = 304;
const NOV_MID = 306;
const NOV_LAST = 309;
const AFTER_RESET = 2;

function day(date: string, cycles: number): BatteryDay {
  return { date, healthPct: 90, cycles, averageW: 8 };
}

describe('cyclesPerMonth', () => {
  it('is empty without data', () => {
    expect(cyclesPerMonth([])).toEqual([]);
  });

  it('counts the first month from its own first day', () => {
    const months = cyclesPerMonth([day('2026-10-20', OCT_FIRST), day('2026-10-31', OCT_LAST)]);

    expect(months).toEqual([{ month: '2026-10', cycles: OCT_LAST - OCT_FIRST }]);
  });

  it('counts a later month from the previous month end', () => {
    const months = cyclesPerMonth([
      day('2026-10-20', OCT_FIRST),
      day('2026-10-31', OCT_LAST),
      day('2026-11-05', NOV_MID),
      day('2026-11-08', NOV_LAST),
    ]);

    expect(months).toEqual([
      { month: '2026-10', cycles: OCT_LAST - OCT_FIRST },
      { month: '2026-11', cycles: NOV_LAST - OCT_LAST },
    ]);
  });

  it('does not depend on the order of the days', () => {
    const months = cyclesPerMonth([day('2026-11-08', NOV_LAST), day('2026-10-31', OCT_LAST)]);

    expect(months).toEqual([
      { month: '2026-10', cycles: 0 },
      { month: '2026-11', cycles: NOV_LAST - OCT_LAST },
    ]);
  });

  it('never reports a negative count when the counter resets', () => {
    const months = cyclesPerMonth([day('2026-10-31', OCT_LAST), day('2026-11-02', AFTER_RESET)]);

    expect(months[1]).toEqual({ month: '2026-11', cycles: 0 });
  });
});
