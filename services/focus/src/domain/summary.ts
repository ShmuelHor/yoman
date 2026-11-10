import type { QueuedAlert } from '@yoman/shared/alerts';

import type { FocusSummary } from '../contracts.js';
import { endedAt, type FocusSession } from './focus-session.js';

/**
 * The summary of a session closing at `nowMs`: when it really ran, and the
 * alerts it held back, oldest first, so they can be delivered on the way out.
 */
export function summarize(
  session: FocusSession,
  nowMs: number,
  held: readonly QueuedAlert[],
): FocusSummary {
  const byQueueTime = [...held].sort((a, b) => Date.parse(a.queuedAt) - Date.parse(b.queuedAt));
  return {
    profileId: session.profileId,
    startedAt: new Date(session.startedAtMs).toISOString(),
    endedAt: new Date(endedAt(session, nowMs)).toISOString(),
    alerts: byQueueTime,
  };
}
