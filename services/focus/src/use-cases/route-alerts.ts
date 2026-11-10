import type { QueuedAlert } from '@yoman/shared/alerts';
import { LIMITS } from '@yoman/shared/limits';

import type { RouteRequest, RouteResult } from '../contracts.js';
import { isRunning } from '../domain/focus-session.js';
import { RATE_LIMIT_MS, routeAlerts } from '../domain/route-alerts.js';
import { closeSession } from './focus-sessions.js';
import type { FocusStore } from './store.js';

/** The queue holds at most what `GET /queue` can return; the oldest alerts go first. */
export const QUEUE_CAPACITY = LIMITS.listSize;

/**
 * Decides an ingest batch's alerts: deliver now, queue, or drop by the rate
 * limit. A session that ran out since the last call is closed first, so its
 * summary rides back on this reply and new alerts are routed as outside focus.
 */
export function routeIncoming(
  store: FocusStore,
  request: RouteRequest,
  now: Date,
): Promise<RouteResult> {
  const nowMs = now.getTime();
  return store.transaction(async (tx) => {
    await tx.lock();
    const open = await tx.openSession();
    const inFocus = isRunning(open, nowMs);
    const summary = open !== null && !inFocus ? await closeSession(tx, open, nowMs) : null;

    await tx.forgetAcceptedBefore(nowMs - RATE_LIMIT_MS);
    const outcome = routeAlerts({
      alerts: request.alerts,
      policy: await tx.alertPolicy(),
      inFocus,
      lastAccepted: await tx.lastAccepted(request.alerts.map((alert) => alert.alertKey)),
      nowMs,
    });
    await tx.recordAccepted(outcome.acceptedKeys, nowMs);
    await tx.enqueue(outcome.queue, nowMs, QUEUE_CAPACITY);

    return {
      deliver: outcome.deliver,
      queued: outcome.queue.length,
      rateLimited: outcome.limited,
      summary,
    };
  });
}

export function listQueue(store: FocusStore): Promise<QueuedAlert[]> {
  return store.transaction((tx) => tx.listQueue(QUEUE_CAPACITY));
}
