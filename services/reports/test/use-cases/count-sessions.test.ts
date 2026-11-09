import { describe, expect, it } from 'vitest';

import type { ClosedSession } from '../../src/contracts.js';
import { countSessions } from '../../src/use-cases/count-sessions.js';
import { dayReport } from '../../src/use-cases/read-reports.js';
import { createMemoryStore } from '../memory-store.js';

const JERUSALEM = 'Asia/Jerusalem';
const MS_PER_SECOND = 1_000;
const UUID_NODE_LENGTH = 12;

function closed(id: string, appId: string, start: string, end: string): ClosedSession {
  return {
    session: {
      id: `00000000-0000-4000-8000-${id.padStart(UUID_NODE_LENGTH, '0')}`,
      appId,
      start,
      end,
    },
    category: appId === 'code' ? 'work' : null,
  };
}

function secondsBetween(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / MS_PER_SECOND;
}

describe('countSessions', () => {
  it('counts a session that crosses local midnight on both days', async () => {
    const store = createMemoryStore();
    // 23:30 to 00:15 in Jerusalem (UTC+2).
    const start = '2026-11-08T21:30:00.000Z';
    const localMidnight = '2026-11-08T22:00:00.000Z';
    const end = '2026-11-08T22:15:00.000Z';

    await countSessions(store, [closed('1', 'code', start, end)], JERUSALEM);
    const eighth = await dayReport(store, '2026-11-08', JERUSALEM);
    const ninth = await dayReport(store, '2026-11-09', JERUSALEM);

    expect(eighth.totalSeconds).toBe(secondsBetween(start, localMidnight));
    expect(ninth.totalSeconds).toBe(secondsBetween(localMidnight, end));
    expect(eighth.longestFocusStreakSeconds).toBe(secondsBetween(start, end));
    expect(ninth.longestFocusStreakSeconds).toBe(0);
  });

  it('skips sessions an earlier batch, or the same batch, already counted', async () => {
    const store = createMemoryStore();
    const first = closed('1', 'code', '2026-11-08T08:00:00.000Z', '2026-11-08T09:00:00.000Z');
    const second = closed('2', 'firefox', '2026-11-08T09:00:00.000Z', '2026-11-08T09:30:00.000Z');

    const initial = await countSessions(store, [first], JERUSALEM);
    const retry = await countSessions(store, [first, second, second], JERUSALEM);
    const report = await dayReport(store, '2026-11-08', JERUSALEM);

    expect(initial).toEqual({ counted: 1, duplicates: 0 });
    expect(retry).toEqual({ counted: 1, duplicates: 2 });
    expect(report.totalSeconds).toBe(
      secondsBetween('2026-11-08T08:00:00.000Z', '2026-11-08T09:30:00.000Z'),
    );
  });

  it('continues a focus streak across batches', async () => {
    const store = createMemoryStore();
    const morning = closed('1', 'code', '2026-11-08T08:00:00.000Z', '2026-11-08T09:00:00.000Z');
    const glance = closed('2', 'slack', '2026-11-08T09:00:00.000Z', '2026-11-08T09:00:30.000Z');
    const more = closed('3', 'code', '2026-11-08T09:00:30.000Z', '2026-11-08T10:00:00.000Z');

    await countSessions(store, [morning], JERUSALEM);
    await countSessions(store, [glance, more], JERUSALEM);
    const report = await dayReport(store, '2026-11-08', JERUSALEM);

    expect(store.state().streaks).toHaveLength(1);
    expect(report.longestFocusStreakSeconds).toBe(
      secondsBetween('2026-11-08T08:00:00.000Z', '2026-11-08T10:00:00.000Z'),
    );
  });

  it('stores no streak for uncategorized time', async () => {
    const store = createMemoryStore();
    const browsing = closed('1', 'firefox', '2026-11-08T08:00:00.000Z', '2026-11-08T09:00:00.000Z');

    await countSessions(store, [browsing], JERUSALEM);

    expect(store.state().rollups).toHaveLength(1);
    expect(store.state().streaks).toEqual([]);
  });
});
