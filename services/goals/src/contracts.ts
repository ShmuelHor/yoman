import { Alert } from '@yoman/shared/alerts';
import { LocalDate } from '@yoman/shared/common';
import { LIMITS } from '@yoman/shared/limits';
import { AppTotal, CategoryTotal } from '@yoman/shared/reports';
import { z } from 'zod';

/**
 * The gateway-to-goals contracts that `@yoman/shared` has no public
 * counterpart for. They are built only from shared schemas, so every item
 * still validates against the shared contract.
 */

/** One day's evaluation can also close the day before it, so up to two days of goals breach. */
const MAX_BREACHES = LIMITS.listSize * 2;

function isUnique<T>(items: readonly T[], key: (item: T) => unknown): boolean {
  return new Set(items.map(key)).size === items.length;
}

/**
 * `POST /evaluate`: a day's usage so far, as reports totals it. The totals are
 * absolute, not increments, so a retried request changes nothing.
 */
export const DayTotals = z.strictObject({
  date: LocalDate,
  apps: z
    .array(AppTotal)
    .max(LIMITS.listSize)
    .refine((apps) => isUnique(apps, (app) => app.appId), { message: 'apps must be unique' }),
  categories: z
    .array(CategoryTotal)
    .max(LIMITS.listSize)
    .refine((categories) => isUnique(categories, (total) => total.category), {
      message: 'categories must be unique',
    }),
});
export type DayTotals = z.infer<typeof DayTotals>;

/** `POST /evaluate` reply: a `goal-breach` alert for each goal breached for the first time that day. */
export const EvaluateResult = z.strictObject({
  breaches: z.array(Alert).max(MAX_BREACHES),
});
export type EvaluateResult = z.infer<typeof EvaluateResult>;
