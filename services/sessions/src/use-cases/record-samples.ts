import type { WindowSample } from '@yoman/shared/ingest';
import { LIMITS } from '@yoman/shared/limits';

import type { ClosedSession, SampleResult } from '../contracts.js';
import { resolveCategory } from '../domain/categorize.js';
import { type ActivitySample, mergeSamples } from '../domain/merge-samples.js';
import type { CategorizedSpan, SessionsStore, StoredSpan } from './store.js';

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
    const { spans, accepted, late } = mergeSamples(stored, samples.map(toActivity));
    if (spans.length === 0) {
      return { accepted, late, closed: [] };
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
    return { accepted, late, closed: saved.filter((span) => span.closed).map(toClosedSession) };
  });
}
