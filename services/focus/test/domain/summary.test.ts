import type { QueuedAlert } from '@yoman/shared/alerts';
import { describe, expect, it } from 'vitest';

import { FocusSummary } from '../../src/contracts.js';
import type { FocusSession } from '../../src/domain/focus-session.js';
import { summarize } from '../../src/domain/summary.js';

const session: FocusSession = {
  id: '00000000-0000-4000-8000-000000000001',
  profileId: '00000000-0000-4000-8000-0000000000aa',
  source: 'manual',
  startedAtMs: Date.parse('2026-11-08T10:00:00.000Z'),
  endsAtMs: Date.parse('2026-11-08T11:00:00.000Z'),
  mutedApps: [],
};

function queued(alertKey: string, queuedAt: string): QueuedAlert {
  return {
    alert: { alertKey, type: 'thermal', level: 'normal', ts: queuedAt, params: { celsius: 95 } },
    queuedAt,
  };
}

describe('summarize', () => {
  it('lists the held alerts oldest first, with when the session really ran', () => {
    const later = queued('thermal:b', '2026-11-08T10:40:00.000Z');
    const earlier = queued('thermal:a', '2026-11-08T10:10:00.000Z');

    const summary = summarize(session, Date.parse('2026-11-08T10:45:00.000Z'), [later, earlier]);

    expect(FocusSummary.parse(summary)).toEqual({
      profileId: session.profileId,
      startedAt: '2026-11-08T10:00:00.000Z',
      endedAt: '2026-11-08T10:45:00.000Z',
      alerts: [earlier, later],
    });
  });

  it('ends a session that ran out at its planned end, even when closed later', () => {
    const summary = summarize(session, Date.parse('2026-11-08T13:00:00.000Z'), []);

    expect(summary.endedAt).toBe('2026-11-08T11:00:00.000Z');
    expect(summary.alerts).toEqual([]);
  });
});
