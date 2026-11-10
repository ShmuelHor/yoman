import { describe, expect, it } from 'vitest';

import {
  endedAt,
  type FocusSession,
  isRunning,
  resolveEndsAt,
  toFocusState,
} from '../../src/domain/focus-session.js';

const MINUTE_MS = 60_000;
const START_MS = Date.parse('2026-11-08T10:00:00.000Z');
const SESSION_MINUTES = 30;
const POMODORO_MINUTES = 25;
const END_MS = START_MS + SESSION_MINUTES * MINUTE_MS;
const JERUSALEM = 'Asia/Jerusalem';

const session: FocusSession = {
  id: '00000000-0000-4000-8000-000000000001',
  profileId: '00000000-0000-4000-8000-0000000000aa',
  source: 'manual',
  startedAtMs: START_MS,
  endsAtMs: END_MS,
  mutedApps: ['slack'],
};

describe('toFocusState', () => {
  it('reports a running session', () => {
    expect(toFocusState(session, START_MS + MINUTE_MS)).toEqual({
      active: true,
      profileId: session.profileId,
      source: 'manual',
      startedAt: '2026-11-08T10:00:00.000Z',
      endsAt: '2026-11-08T10:30:00.000Z',
    });
  });

  it('reports no focus without a session, and once the end time has come', () => {
    expect(toFocusState(null, START_MS)).toEqual({ active: false });
    expect(toFocusState(session, END_MS)).toEqual({ active: false });
    expect(isRunning(session, END_MS - 1)).toBe(true);
  });
});

describe('resolveEndsAt', () => {
  it('ends a duration focus after its minutes', () => {
    expect(resolveEndsAt({ minutes: POMODORO_MINUTES }, START_MS, JERUSALEM)).toBe(
      START_MS + POMODORO_MINUTES * MINUTE_MS,
    );
  });

  it('ends an until focus at the next local occurrence of that time', () => {
    // 10:00 UTC is 12:00 in Jerusalem (UTC+2 in November).
    expect(new Date(resolveEndsAt({ until: '14:30' }, START_MS, JERUSALEM)).toISOString()).toBe(
      '2026-11-08T12:30:00.000Z',
    );
  });

  it('ends an until focus tomorrow when the time has already passed today', () => {
    expect(new Date(resolveEndsAt({ until: '11:00' }, START_MS, JERUSALEM)).toISOString()).toBe(
      '2026-11-09T09:00:00.000Z',
    );
    expect(new Date(resolveEndsAt({ until: '12:00' }, START_MS, JERUSALEM)).toISOString()).toBe(
      '2026-11-09T10:00:00.000Z',
    );
  });

  it('reads the clock time in the configured zone, across midnight', () => {
    const lateEvening = Date.parse('2026-11-08T21:30:00.000Z'); // 23:30 in Jerusalem

    expect(new Date(resolveEndsAt({ until: '00:15' }, lateEvening, JERUSALEM)).toISOString()).toBe(
      '2026-11-08T22:15:00.000Z',
    );
    expect(new Date(resolveEndsAt({ until: '00:15' }, lateEvening, 'UTC')).toISOString()).toBe(
      '2026-11-09T00:15:00.000Z',
    );
  });

  it('moves a time skipped by DST forward by the gap, and takes the earlier of a repeated time', () => {
    // Jerusalem springs forward at 02:00 on 2026-03-27 and falls back at 02:00 on 2026-10-25.
    const beforeSpring = Date.parse('2026-03-26T22:00:00.000Z'); // 00:00 local
    const beforeFall = Date.parse('2026-10-24T21:00:00.000Z'); // 00:00 local

    expect(new Date(resolveEndsAt({ until: '02:30' }, beforeSpring, JERUSALEM)).toISOString()).toBe(
      '2026-03-27T00:30:00.000Z',
    );
    expect(new Date(resolveEndsAt({ until: '01:30' }, beforeFall, JERUSALEM)).toISOString()).toBe(
      '2026-10-24T22:30:00.000Z',
    );
  });
});

describe('endedAt', () => {
  it('ends a stopped session now and an expired one at its planned end', () => {
    expect(endedAt(session, START_MS + MINUTE_MS)).toBe(START_MS + MINUTE_MS);
    expect(endedAt(session, END_MS + MINUTE_MS)).toBe(END_MS);
  });

  it('never ends before the session started', () => {
    expect(endedAt(session, START_MS - MINUTE_MS)).toBe(START_MS);
  });
});
