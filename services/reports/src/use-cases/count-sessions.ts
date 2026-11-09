import type { ClosedSession, SessionBatchResult } from '../contracts.js';
import { type CountedSession, rollUp } from '../domain/rollup.js';
import { MAX_INTERRUPTION_MS, mergeStreaks } from '../domain/streaks.js';
import type { ReportsStore, ReportsTransaction } from './store.js';

interface IdentifiedSession extends CountedSession {
  readonly id: string;
}

function toCounted({ session, category }: ClosedSession): IdentifiedSession {
  return {
    id: session.id,
    appId: session.appId,
    category,
    startMs: Date.parse(session.start),
    endMs: Date.parse(session.end),
  };
}

/** The first of each id, so a session sent twice in one batch counts once. */
function uniqueById(sessions: readonly IdentifiedSession[]): IdentifiedSession[] {
  const byId = new Map<string, IdentifiedSession>();
  for (const session of sessions) {
    if (!byId.has(session.id)) {
      byId.set(session.id, session);
    }
  }
  return [...byId.values()];
}

async function updateStreaks(
  tx: ReportsTransaction,
  sessions: readonly CountedSession[],
): Promise<void> {
  // Uncategorized time never forms a streak, so it neither needs nor widens the lookup.
  const categorized = sessions.filter((session) => session.category !== null);
  const categories = [
    ...new Set(
      categorized.flatMap((session) => (session.category === null ? [] : [session.category])),
    ),
  ];
  if (categorized.length === 0) {
    return;
  }
  const fromMs = Math.min(...categorized.map((session) => session.startMs)) - MAX_INTERRUPTION_MS;
  const toMs = Math.max(...categorized.map((session) => session.endMs)) + MAX_INTERRUPTION_MS;
  const stored = await tx.streaksNear(categories, fromMs, toMs);
  const changes = mergeStreaks(stored, categorized);
  await tx.replaceStreaks(changes.removed, changes.added);
}

/**
 * Counts closed sessions into the daily rollups and the focus streaks, in one
 * transaction. A session already counted is skipped, so the gateway may retry
 * a batch safely.
 */
export function countSessions(
  store: ReportsStore,
  batch: readonly ClosedSession[],
  zone: string,
): Promise<SessionBatchResult> {
  return store.transaction(async (tx) => {
    await tx.lockWrites();
    const sessions = uniqueById(batch.map(toCounted));
    const fresh = await tx.markCounted(sessions.map(({ id, endMs }) => ({ id, endMs })));
    const counted = sessions.filter((session) => fresh.has(session.id));
    if (counted.length > 0) {
      await tx.addToRollups(rollUp(counted, zone));
      await updateStreaks(tx, counted);
    }
    return { counted: counted.length, duplicates: batch.length - counted.length };
  });
}
