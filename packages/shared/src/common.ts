import { z } from 'zod';
import { LIMITS } from './limits.js';

const MS_PER_DAY = 86_400_000;

/** An application ID (normalized `wm_class` or desktop ID). Never contains `/`, spaces or quotes. */
export const AppId = z.string().regex(/^[a-zA-Z0-9._-]{1,128}$/);
export type AppId = z.infer<typeof AppId>;

export const EntityId = z.uuid();
export type EntityId = z.infer<typeof EntityId>;

export const Timestamp = z.iso.datetime({ offset: true });
export type Timestamp = z.infer<typeof Timestamp>;

export const LocalDate = z.iso.date();
export type LocalDate = z.infer<typeof LocalDate>;

/** A wall-clock time, `HH:MM` in 24-hour form. */
export const ClockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export type ClockTime = z.infer<typeof ClockTime>;

/** A user-defined category slug, for example `work` or `social-media`. */
export const Category = z.string().regex(/^[a-z0-9-]{1,32}$/);
export type Category = z.infer<typeof Category>;

/** A human-readable label: an app name, a profile name. Untrusted, so only bounded. */
export const Label = z.string().trim().min(1).max(LIMITS.nameLength);
export type Label = z.infer<typeof Label>;

export const Percent = z.number().min(0).max(LIMITS.percent);
export type Percent = z.infer<typeof Percent>;

export const Seconds = z
  .int()
  .min(0)
  .max(LIMITS.secondsPerWeek * LIMITS.rangeDays);
export type Seconds = z.infer<typeof Seconds>;

export const Bytes = z.int().min(0).max(LIMITS.bytes);
export type Bytes = z.infer<typeof Bytes>;

export const Pid = z.int().min(1).max(LIMITS.pid);
export type Pid = z.infer<typeof Pid>;

/** A process `comm` (never `cmdline`, SECURITY A9). */
export const Comm = z.string().min(1).max(LIMITS.commLength);
export type Comm = z.infer<typeof Comm>;

export const ServiceName = z.enum(['sessions', 'reports', 'battery', 'system', 'focus']);
export type ServiceName = z.infer<typeof ServiceName>;

/** The gateway's partial-response envelope: `{data, degraded:["battery"]}` (SPEC §5 gateway). */
export const withDegraded = <T extends z.ZodType>(
  data: T,
): z.ZodObject<{ data: T; degraded: z.ZodArray<typeof ServiceName> }, z.core.$strict> =>
  z.strictObject({ data, degraded: z.array(ServiceName).max(ServiceName.options.length) });

export const IdParams = z.strictObject({ id: EntityId });
export type IdParams = z.infer<typeof IdParams>;

export const AppIdParams = z.strictObject({ id: AppId });
export type AppIdParams = z.infer<typeof AppIdParams>;

/** A `from`/`to` range in query strings; `to` is exclusive. */
export const TimeRangeQuery = z
  .strictObject({ from: Timestamp, to: Timestamp })
  .refine((q) => Date.parse(q.from) < Date.parse(q.to), { message: 'from must be before to' })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= LIMITS.rangeDays * MS_PER_DAY, {
    message: `the range is at most ${LIMITS.rangeDays} days`,
  });
export type TimeRangeQuery = z.infer<typeof TimeRangeQuery>;

export const DateQuery = z.strictObject({ date: LocalDate });
export type DateQuery = z.infer<typeof DateQuery>;
