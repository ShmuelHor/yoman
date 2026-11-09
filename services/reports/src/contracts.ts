import { Category, LocalDate } from '@yoman/shared/common';
import { LIMITS } from '@yoman/shared/limits';
import { AppTotal } from '@yoman/shared/reports';
import { Session } from '@yoman/shared/sessions';
import { z } from 'zod';

/**
 * The gateway-to-reports contracts that `@yoman/shared` has no public
 * counterpart for. They are built only from shared schemas, so every item
 * still validates against the shared contract.
 */

const MS_PER_SECOND = 1_000;
const MS_PER_DAY = 86_400_000;

/**
 * Reports counts time from 2000 to 2100 only. A clock outside that is broken,
 * and bounding it keeps every local date and every week a valid `LocalDate`.
 */
const FIRST_DAY = '2000-01-01';
const END_DAY = '2100-01-01';
const FIRST_MS = Date.parse(FIRST_DAY);
const END_MS = Date.parse(END_DAY);

/** The agent closes a session after 2 minutes idle, so a week-long one is already absurd. */
const MAX_SESSION_MS = LIMITS.secondsPerWeek * MS_PER_SECOND;

/** A `LocalDate` reports can do arithmetic on. */
export const ReportDate = LocalDate.refine((date) => date >= FIRST_DAY && date < END_DAY, {
  message: `the date must be from ${FIRST_DAY} and before ${END_DAY}`,
});
export type ReportDate = z.infer<typeof ReportDate>;

/**
 * A session the sessions service closed, with the category it was stored
 * under. The same shape as the sessions service's `ClosedSession`, so the
 * gateway forwards its `closed` list as it is (SPEC §3, ingest flow).
 */
export const ClosedSession = z
  .strictObject({ session: Session, category: Category.nullable() })
  .refine(
    ({ session }) => Date.parse(session.start) >= FIRST_MS && Date.parse(session.end) < END_MS,
    { message: `the session must be from ${FIRST_DAY} and before ${END_DAY}` },
  )
  .refine(({ session }) => Date.parse(session.end) - Date.parse(session.start) <= MAX_SESSION_MS, {
    message: 'a session is at most a week long',
  });
export type ClosedSession = z.infer<typeof ClosedSession>;

/** `POST /sessions`: the sessions one ingest batch closed. */
export const SessionBatch = z.strictObject({
  sessions: z.array(ClosedSession).min(1).max(LIMITS.ingestSamples),
});
export type SessionBatch = z.infer<typeof SessionBatch>;

/** `POST /sessions` reply. */
export const SessionBatchResult = z.strictObject({
  counted: z.int().min(0).max(LIMITS.ingestSamples),
  /** Sessions already counted by an earlier batch, a retry, so skipped. */
  duplicates: z.int().min(0).max(LIMITS.ingestSamples),
});
export type SessionBatchResult = z.infer<typeof SessionBatchResult>;

/** `GET /week?start`: the shared `WeekQuery`, with a date reports can count from. */
export const ReportWeekQuery = z.strictObject({ start: ReportDate });
export type ReportWeekQuery = z.infer<typeof ReportWeekQuery>;

/** `GET /top-apps?from&to`: whole local days, `to` exclusive, like `TimeRangeQuery`. */
export const TopAppsQuery = z
  .strictObject({ from: ReportDate, to: ReportDate })
  .refine((q) => q.from < q.to, { message: 'from must be before to' })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= LIMITS.rangeDays * MS_PER_DAY, {
    message: `the range is at most ${LIMITS.rangeDays} days`,
  });
export type TopAppsQuery = z.infer<typeof TopAppsQuery>;

/** `GET /top-apps` reply: apps by total time, largest first. */
export const TopAppList = z.strictObject({
  items: z.array(AppTotal).max(LIMITS.listSize),
});
export type TopAppList = z.infer<typeof TopAppList>;
