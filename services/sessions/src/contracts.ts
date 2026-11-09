import { Category } from '@yoman/shared/common';
import { WindowSample } from '@yoman/shared/ingest';
import { LIMITS } from '@yoman/shared/limits';
import { Session } from '@yoman/shared/sessions';
import { z } from 'zod';

/**
 * The gateway-to-sessions contracts that `@yoman/shared` has no public
 * counterpart for. They are built only from shared schemas, so every item
 * still validates against the shared contract.
 */

/** `POST /samples`: the window samples of one ingest batch, as the gateway splits them out. */
export const SampleBatch = z.strictObject({
  samples: z.array(WindowSample).min(1).max(LIMITS.ingestSamples),
});
export type SampleBatch = z.infer<typeof SampleBatch>;

/** A session closed by a batch, with the category reports and goals total it under. */
export const ClosedSession = z.strictObject({
  session: Session,
  category: Category.nullable(),
});
export type ClosedSession = z.infer<typeof ClosedSession>;

/** `POST /samples` reply. `closed` goes on to reports and goals (SPEC §3, ingest flow). */
export const SampleResult = z.strictObject({
  accepted: z.int().min(0).max(LIMITS.ingestSamples),
  /** Samples already covered by the stored open session, so dropped. */
  late: z.int().min(0).max(LIMITS.ingestSamples),
  closed: z.array(ClosedSession).max(LIMITS.ingestSamples),
});
export type SampleResult = z.infer<typeof SampleResult>;

/** `GET /sessions?from&to`: every session overlapping the range, oldest first. */
export const SessionList = z.strictObject({
  items: z.array(Session).max(LIMITS.exportSessions),
});
export type SessionList = z.infer<typeof SessionList>;
