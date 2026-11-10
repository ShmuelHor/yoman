import { Alert, QueuedAlert } from '@yoman/shared/alerts';
import { ClockTime, EntityId, Timestamp } from '@yoman/shared/common';
import { FocusChange } from '@yoman/shared/focus';
import { LIMITS } from '@yoman/shared/limits';
import { z } from 'zod';

/**
 * The gateway-to-focus contracts that `@yoman/shared` has no public
 * counterpart for. They are built only from shared schemas, so every item
 * still validates against the shared contract.
 */

/**
 * What a focus session held back, handed over when it ends (SPEC §5 focus:
 * during focus everything that did not get through is queued). Its alerts
 * leave the queue with it.
 */
export const FocusSummary = z.strictObject({
  profileId: EntityId,
  startedAt: Timestamp,
  endedAt: Timestamp,
  /** The queued alerts, oldest first. */
  alerts: z.array(QueuedAlert).max(LIMITS.listSize),
});
export type FocusSummary = z.infer<typeof FocusSummary>;

/**
 * `POST /start` and `POST /stop` reply: the public `FocusChange`, plus the
 * summary of the session this change closed, or `null` when none was open.
 */
export const FocusTransition = z.strictObject({
  ...FocusChange.shape,
  summary: FocusSummary.nullable(),
});
export type FocusTransition = z.infer<typeof FocusTransition>;

/** `POST /route`: the alerts the gateway collected from one ingest batch. May be empty. */
export const RouteRequest = z.strictObject({
  alerts: z.array(Alert).max(LIMITS.listSize),
});
export type RouteRequest = z.infer<typeof RouteRequest>;

/** `POST /route` reply (SPEC §3 ingest flow: deliver now or queue). */
export const RouteResult = z.strictObject({
  /** Alerts to notify now, each at its effective level. */
  deliver: z.array(Alert).max(LIMITS.listSize),
  queued: z.int().min(0).max(LIMITS.listSize),
  /** Alerts dropped because their `alertKey` already went out in the last 10 min. */
  rateLimited: z.int().min(0).max(LIMITS.listSize),
  /** The summary of a session that ran out since the last call, or `null`. */
  summary: FocusSummary.nullable(),
});
export type RouteResult = z.infer<typeof RouteResult>;

const Weekday = z.int().min(0).max(LIMITS.lastWeekday);

/** A weekly window in which the focus automation (T45) starts the profile. */
export const ScheduleInput = z
  .strictObject({
    profileId: EntityId,
    /** 0 is Sunday. */
    days: z
      .array(Weekday)
      .min(1)
      .max(LIMITS.daysPerWeek)
      .refine((days) => new Set(days).size === days.length, { message: 'days must be unique' }),
    start: ClockTime,
    /** Earlier than `start` means the window runs past midnight. */
    end: ClockTime,
    enabled: z.boolean(),
  })
  .refine((schedule) => schedule.start !== schedule.end, {
    message: 'start and end must differ',
    path: ['end'],
  });
export type ScheduleInput = z.infer<typeof ScheduleInput>;

export const Schedule = z.strictObject({ id: EntityId, ...ScheduleInput.shape });
export type Schedule = z.infer<typeof Schedule>;

export const ScheduleList = z.strictObject({ items: z.array(Schedule).max(LIMITS.listSize) });
export type ScheduleList = z.infer<typeof ScheduleList>;
