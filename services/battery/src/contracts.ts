import { Alert } from '@yoman/shared/alerts';
import { AppId, TimeRangeQuery, Timestamp } from '@yoman/shared/common';
import { BatterySample } from '@yoman/shared/ingest';
import { LIMITS } from '@yoman/shared/limits';
import { z } from 'zod';

/**
 * The gateway-to-battery contracts that `@yoman/shared` has no public
 * counterpart for. They are built only from shared schemas, so every item
 * still validates against the shared contract.
 */

/** One alert per battery alert type at most. */
const MAX_ALERTS = 3;

/** `POST /samples`: the battery samples of one ingest batch, as the gateway splits them out. */
export const SampleBatch = z.strictObject({
  samples: z.array(BatterySample).min(1).max(LIMITS.ingestSamples),
});
export type SampleBatch = z.infer<typeof SampleBatch>;

/** `POST /samples` reply. `alerts` go on to focus for a decision (SPEC §3, ingest flow). */
export const SampleResult = z.strictObject({
  accepted: z.int().min(0).max(LIMITS.ingestSamples),
  /** Samples with a timestamp already stored, so dropped: a retried batch. */
  duplicates: z.int().min(0).max(LIMITS.ingestSamples),
  alerts: z.array(Alert).max(MAX_ALERTS),
});
export type SampleResult = z.infer<typeof SampleResult>;

/** One session of the gateway's timeline: only the app and its time, never the title. */
export const FocusSession = z
  .strictObject({ appId: AppId, start: Timestamp, end: Timestamp })
  .refine((s) => Date.parse(s.start) <= Date.parse(s.end), {
    message: 'start must not be after end',
  });
export type FocusSession = z.infer<typeof FocusSession>;

/**
 * `POST /power-by-app`: the range and the sessions in it, which the gateway
 * fetches from sessions (SPEC §5 battery). A body rather than a query string,
 * since a range of up to 92 days holds far more sessions than a URL can.
 */
export const PowerByAppRequest = TimeRangeQuery.safeExtend({
  sessions: z.array(FocusSession).max(LIMITS.exportSessions),
});
export type PowerByAppRequest = z.infer<typeof PowerByAppRequest>;
