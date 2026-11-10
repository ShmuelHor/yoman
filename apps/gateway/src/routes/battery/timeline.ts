import type { TimeRangeQuery } from '@yoman/shared/common';
import { LIMITS } from '@yoman/shared/limits';
import { Session } from '@yoman/shared/sessions';
import { z } from 'zod';

/** The sessions service's `GET /sessions` reply: every session overlapping the range. */
export const SessionRange = z.strictObject({
  items: z.array(Session).max(LIMITS.exportSessions),
});
export type SessionRange = z.infer<typeof SessionRange>;

/** The body of battery's `POST /power-by-app`. */
export interface PowerByAppBody extends TimeRangeQuery {
  readonly sessions: readonly Pick<Session, 'appId' | 'start' | 'end'>[];
}

/** Keeps the app and its time only: window titles never leave sessions for battery. */
export function toPowerByAppRequest(
  range: TimeRangeQuery,
  sessions: SessionRange['items'],
): PowerByAppBody {
  return {
    from: range.from,
    to: range.to,
    sessions: sessions.map(({ appId, start, end }) => ({ appId, start, end })),
  };
}
