import type { FocusSource, FocusStart, FocusState } from '@yoman/shared/focus';

import { nextOccurrence } from './local-time.js';

const MS_PER_MINUTE = 60_000;

/** A focus session as stored: open until something closes it, even past `endsAtMs`. */
export interface FocusSession {
  readonly id: string;
  readonly profileId: string;
  readonly source: FocusSource;
  readonly startedAtMs: number;
  readonly endsAtMs: number;
  /** Exactly what the session muted, so closing it restores the same apps. */
  readonly mutedApps: readonly string[];
}

/** True while the session runs: it is open and its end time has not come. */
export function isRunning(session: FocusSession | null, nowMs: number): session is FocusSession {
  return session !== null && nowMs < session.endsAtMs;
}

/** The public state. A session past its end is reported as over before anything closes it. */
export function toFocusState(session: FocusSession | null, nowMs: number): FocusState {
  if (!isRunning(session, nowMs)) {
    return { active: false };
  }
  return {
    active: true,
    profileId: session.profileId,
    source: session.source,
    startedAt: new Date(session.startedAtMs).toISOString(),
    endsAt: new Date(session.endsAtMs).toISOString(),
  };
}

/**
 * When a focus started at `nowMs` ends: after the given minutes, or at the
 * next time the local clock shows `until`, which is tomorrow when that time
 * has already passed today.
 */
export function resolveEndsAt(request: FocusStart, nowMs: number, timeZone: string): number {
  if ('minutes' in request) {
    return nowMs + request.minutes * MS_PER_MINUTE;
  }
  return nextOccurrence(request.until, nowMs, timeZone);
}

/**
 * When a session closing at `nowMs` actually ended: now if it was stopped
 * early, or its planned end if it ran out before anything closed it.
 */
export function endedAt(session: FocusSession, nowMs: number): number {
  return Math.max(session.startedAtMs, Math.min(nowMs, session.endsAtMs));
}
