import { z } from 'zod';
import { AppId, Category, EntityId, Label, Timestamp } from './common.js';
import { LIMITS } from './limits.js';

export const App = z.strictObject({
  id: AppId,
  name: Label,
  /** A freedesktop icon name, never a path or URL. */
  icon: z
    .string()
    .regex(/^[a-zA-Z0-9._-]{1,128}$/)
    .nullable(),
  category: Category.nullable(),
});
export type App = z.infer<typeof App>;

export const AppList = z.strictObject({ items: z.array(App).max(LIMITS.listSize) });
export type AppList = z.infer<typeof AppList>;

/** `PUT /v1/apps/:id`: the user renames or recategorizes an app. */
export const AppUpdate = z.strictObject({
  name: Label,
  category: Category.nullable(),
});
export type AppUpdate = z.infer<typeof AppUpdate>;

export const Session = z
  .strictObject({
    id: EntityId,
    appId: AppId,
    start: Timestamp,
    end: Timestamp,
    title: z.string().max(LIMITS.titleLength).optional(),
  })
  .refine((s) => Date.parse(s.start) <= Date.parse(s.end), {
    message: 'start must not be after end',
  });
export type Session = z.infer<typeof Session>;

/**
 * How a rule's pattern is compared. Plain string matching only: user-supplied regular
 * expressions would let a rule hang the sessions service (ReDoS).
 */
export const RuleMatch = z.enum(['exact', 'prefix', 'contains']);
export type RuleMatch = z.infer<typeof RuleMatch>;

export const RuleInput = z.strictObject({
  field: z.enum(['wmClass', 'title']),
  match: RuleMatch,
  pattern: z.string().min(1).max(LIMITS.patternLength),
  category: Category,
  /** Higher wins when several rules match. */
  priority: z.int().min(0).max(LIMITS.rulePriority),
});
export type RuleInput = z.infer<typeof RuleInput>;

export const Rule = z.strictObject({ id: EntityId, ...RuleInput.shape });
export type Rule = z.infer<typeof Rule>;

export const RuleList = z.strictObject({ items: z.array(Rule).max(LIMITS.listSize) });
export type RuleList = z.infer<typeof RuleList>;
