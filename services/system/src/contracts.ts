import { Alert } from '@yoman/shared/alerts';
import { LocalDate } from '@yoman/shared/common';
import { PressureSample, ProcessSample, ThermalSample } from '@yoman/shared/ingest';
import { LIMITS } from '@yoman/shared/limits';
import { Settings } from '@yoman/shared/settings';
import { z } from 'zod';

/**
 * The gateway-to-system contracts that `@yoman/shared` has no public
 * counterpart for. They are built only from shared schemas, so every item
 * still validates against the shared contract.
 */

/** The samples of an ingest batch that belong to this service (SPEC §3, ingest flow). */
export const SystemSample = z.discriminatedUnion('kind', [
  PressureSample,
  ProcessSample,
  ThermalSample,
]);
export type SystemSample = z.infer<typeof SystemSample>;

/**
 * `POST /samples`: the load samples of one ingest batch, as the gateway splits
 * them out, with the user's pressure thresholds from `gateway.settings`.
 */
export const SampleBatch = z.strictObject({
  thresholds: Settings.shape.thresholds,
  samples: z.array(SystemSample).min(1).max(LIMITS.ingestSamples),
});
export type SampleBatch = z.infer<typeof SampleBatch>;

/** `POST /samples` reply. `alerts` goes on to focus for a decision (SPEC §3, ingest flow). */
export const SampleResult = z.strictObject({
  accepted: z.int().min(0).max(LIMITS.ingestSamples),
  /** Samples an earlier batch already applied, so dropped. */
  late: z.int().min(0).max(LIMITS.ingestSamples),
  /** One alert for each incident the batch opened, at most one per `alertKey`. */
  alerts: z.array(Alert).max(LIMITS.listSize),
});
export type SampleResult = z.infer<typeof SampleResult>;

/**
 * Local days are counted from 2000 to 2100 only. A clock outside that is
 * broken, and bounding it keeps the day after any date a valid `LocalDate`.
 */
const FIRST_DAY = '2000-01-01';
const END_DAY = '2100-01-01';

/** `GET /timeline?date`: the shared `DateQuery`, with a date the service can count from. */
export const TimelineQuery = z.strictObject({
  date: LocalDate.refine((date) => date >= FIRST_DAY && date < END_DAY, {
    message: `the date must be from ${FIRST_DAY} and before ${END_DAY}`,
  }),
});
export type TimelineQuery = z.infer<typeof TimelineQuery>;
