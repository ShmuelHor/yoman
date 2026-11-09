import { describe, expect, it } from 'vitest';

import type { CountedSession } from '../../src/domain/rollup.js';
import { MAX_INTERRUPTION_MS, mergeStreaks, type StoredStreak } from '../../src/domain/streaks.js';

const STORED_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ID = '00000000-0000-4000-8000-000000000002';

/** A wall-clock time on 2026-11-08, UTC. */
function at(clock: string): number {
  return Date.parse(`2026-11-08T${clock}.000Z`);
}

function session(category: string | null, from: string, to: string): CountedSession {
  return { appId: 'code', category, startMs: at(from), endMs: at(to) };
}

function stored(id: string, category: string, from: string, to: string): StoredStreak {
  return { id, category, startMs: at(from), endMs: at(to) };
}

function streak(category: string, from: string, to: string): object {
  return { id: null, category, startMs: at(from), endMs: at(to) };
}

describe('mergeStreaks', () => {
  it('joins back-to-back sessions of one category into one streak', () => {
    const sessions = [
      session('work', '08:00:00', '08:20:00'),
      session('work', '08:20:00', '08:50:00'),
    ];

    expect(mergeStreaks([], sessions)).toEqual({
      removed: [],
      added: [streak('work', '08:00:00', '08:50:00')],
    });
  });

  it('lets a glance at another app pass, and breaks on a longer interruption', () => {
    expect(MAX_INTERRUPTION_MS).toBe(at('08:21:00') - at('08:20:00'));
    const sessions = [
      session('work', '08:00:00', '08:20:00'),
      session('chat', '08:20:00', '08:21:00'),
      session('work', '08:21:00', '08:40:00'),
      session('chat', '08:40:00', '08:41:01'),
      session('work', '08:41:01', '09:00:00'),
    ];

    expect(mergeStreaks([], sessions).added).toEqual([
      streak('work', '08:00:00', '08:40:00'),
      streak('work', '08:41:01', '09:00:00'),
      streak('chat', '08:20:00', '08:21:00'),
      streak('chat', '08:40:00', '08:41:01'),
    ]);
  });

  it('extends a stored streak and joins two stored ones the new session bridges', () => {
    const before = stored(STORED_ID, 'work', '08:00:00', '08:30:00');
    const after = stored(OTHER_ID, 'work', '08:40:00', '09:00:00');

    const changes = mergeStreaks([before, after], [session('work', '08:30:00', '08:40:00')]);

    expect(changes).toEqual({
      removed: [STORED_ID, OTHER_ID],
      added: [streak('work', '08:00:00', '09:00:00')],
    });
  });

  it('changes nothing when a retried session falls inside a stored streak', () => {
    const changes = mergeStreaks(
      [stored(STORED_ID, 'work', '08:00:00', '09:00:00')],
      [session('work', '08:10:00', '08:20:00')],
    );

    expect(changes).toEqual({ removed: [], added: [] });
  });

  it('gives the same streaks whatever order the sessions arrive in', () => {
    const sessions = [
      session('work', '08:30:00', '08:40:00'),
      session('work', '08:00:00', '08:30:00'),
      session('work', '08:40:00', '08:50:00'),
    ];

    expect(mergeStreaks([], sessions)).toEqual(mergeStreaks([], [...sessions].reverse()));
  });

  it('leaves stored streaks of other categories alone', () => {
    const changes = mergeStreaks(
      [stored(STORED_ID, 'chat', '08:00:00', '08:30:00')],
      [session('work', '08:30:00', '08:40:00')],
    );

    expect(changes).toEqual({ removed: [], added: [streak('work', '08:30:00', '08:40:00')] });
  });

  it('never builds a streak from uncategorized time', () => {
    expect(mergeStreaks([], [session(null, '08:00:00', '09:00:00')])).toEqual({
      removed: [],
      added: [],
    });
  });
});
