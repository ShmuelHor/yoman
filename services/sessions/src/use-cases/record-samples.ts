import type { WindowSample } from '@yoman/shared/ingest';
import { LIMITS } from '@yoman/shared/limits';

import type { ClosedSession, SampleResult } from '../contracts.js';
import { resolveCategory } from '../domain/categorize.js';
import { type ActivitySample, mergeSamples } from '../domain/merge-samples.js';
import type { CategorizedSpan, SessionsStore, SessionsTransaction, StoredSpan } from './store.js';

function toActivity(sample: WindowSample): ActivitySample {
  return {
    tsMs: Date.parse(sample.ts),
    appId: sample.wmClass,
    title: sample.title ?? null,
    idleMs: sample.idleMs,
    locked: sample.locked,
  };
}

function toClosedSession(span: StoredSpan): ClosedSession {
  return {
    session: {
      id: span.id,
      appId: span.appId,
      start: new Date(span.startMs).toISOString(),
      end: new Date(span.endMs).toISOString(),
      ...(span.title === null ? {} : { title: span.title }),
    },
    category: span.category,
  };
}

/**
 * The sessions a retried batch closed the first time. Its samples are all
 * `late`, so nothing new closes, yet the gateway still has to hand those
 * sessions to reports if the first attempt failed after this
 * service committed. Reports counts a session id once, so over-returning is
 * harmless; under-returning would lose time.
 *
 * An idle sample ends its session `idleMs` before itself, so the range starts
 * there rather than at the sample.
 */
async function replayedClosures(
  tx: SessionsTransaction,
  samples: readonly WindowSample[],
  excluded: ReadonlySet<string>,
  room: number,
): Promise<ClosedSession[]> {
  if (samples.length === 0) {
    return [];
  }
  const fromMs = Math.min(...samples.map((sample) => Date.parse(sample.ts) - sample.idleMs));
  const toMs = Math.max(...samples.map((sample) => Date.parse(sample.ts)));
  const spans = await tx.closedSpansOverlapping(fromMs, toMs, LIMITS.ingestSamples);
  // The reply holds at most `ingestSamples` sessions. Oldest first, so what a wide range
  // pulls in beyond `room` is the newest, which are the least likely to be this batch's own.
  return spans
    .filter((span) => !excluded.has(span.id))
    .slice(0, Math.max(0, room))
    .map(toClosedSession);
}

/**
 * Merges a batch into the stored sessions in one transaction: continues the
 * open session, stores new ones under their category, and returns the
 * sessions the batch closed.
 */
export function recordSamples(
  store: SessionsStore,
  samples: readonly WindowSample[],
): Promise<SampleResult> {
  return store.transaction(async (tx) => {
    const stored = await tx.lockOpenSession();
    const { spans, accepted, late, recordedUntilMs } = mergeSamples(
      stored,
      samples.map(toActivity),
      await tx.recordedUntil(),
    );
    if (accepted > 0 && recordedUntilMs !== null) {
      await tx.setRecordedUntil(recordedUntilMs);
    }
    // Any late sample may be a retry, so the sessions it closed are returned again.
    const replay = (closed: readonly ClosedSession[]): Promise<ClosedSession[]> =>
      late === 0
        ? Promise.resolve([])
        : replayedClosures(
            tx,
            samples,
            new Set(closed.map(({ session }) => session.id)),
            LIMITS.ingestSamples - closed.length,
          );
    if (spans.length === 0) {
      return { accepted, late, closed: await replay([]) };
    }

    await tx.ensureApps([...new Set(spans.map((span) => span.appId))]);
    const rules = await tx.listRules(LIMITS.listSize);
    const appCategories = await tx.appCategories();
    const categorized = spans.map(
      (span): CategorizedSpan => ({
        ...span,
        category: resolveCategory(
          { wmClass: span.appId, title: span.title },
          rules,
          appCategories.get(span.appId) ?? null,
        ),
      }),
    );

    const saved = await tx.saveSpans(categorized);
    const closed = saved.filter((span) => span.closed).map(toClosedSession);
    return { accepted, late, closed: [...closed, ...(await replay(closed))] };
  });
}
