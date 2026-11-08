import { z } from 'zod';
import { AppId, Category, EntityId, LocalDate } from './common.js';
import { LIMITS } from './limits.js';

export const GoalTarget = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('app'), appId: AppId }),
  z.strictObject({ kind: z.literal('category'), category: Category }),
]);
export type GoalTarget = z.infer<typeof GoalTarget>;

/** 0 is Sunday, as in `Date.prototype.getDay`. */
export const Weekday = z.int().min(0).max(LIMITS.lastWeekday);
export type Weekday = z.infer<typeof Weekday>;

export const GoalInput = z.strictObject({
  type: z.enum(['max', 'min']),
  target: GoalTarget,
  minutes: z.int().min(1).max(LIMITS.minutesPerDay),
  days: z
    .array(Weekday)
    .min(1)
    .max(LIMITS.daysPerWeek)
    .refine((days) => new Set(days).size === days.length, { message: 'days must be unique' }),
});
export type GoalInput = z.infer<typeof GoalInput>;

export const Goal = z.strictObject({ id: EntityId, ...GoalInput.shape });
export type Goal = z.infer<typeof Goal>;

export const GoalList = z.strictObject({ items: z.array(Goal).max(LIMITS.listSize) });
export type GoalList = z.infer<typeof GoalList>;

export const GoalStatus = z.enum(['on-track', 'met', 'breached']);
export type GoalStatus = z.infer<typeof GoalStatus>;

export const GoalProgressItem = z.strictObject({
  goalId: EntityId,
  minutesUsed: z.int().min(0).max(LIMITS.minutesPerDay),
  targetMinutes: z.int().min(1).max(LIMITS.minutesPerDay),
  status: GoalStatus,
});
export type GoalProgressItem = z.infer<typeof GoalProgressItem>;

export const GoalProgress = z.strictObject({
  date: LocalDate,
  items: z.array(GoalProgressItem).max(LIMITS.listSize),
});
export type GoalProgress = z.infer<typeof GoalProgress>;
