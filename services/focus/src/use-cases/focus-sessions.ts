import { NotFoundError } from '@yoman/service-kit/errors';
import type { FocusStart, FocusState, Profile } from '@yoman/shared/focus';
import { LIMITS } from '@yoman/shared/limits';

import type { FocusSummary, FocusTransition } from '../contracts.js';
import {
  endedAt,
  type FocusSession,
  resolveEndsAt,
  toFocusState,
} from '../domain/focus-session.js';
import { appsToMute, switchMutes } from '../domain/mute-plan.js';
import { summarize } from '../domain/summary.js';
import type { FocusStore, FocusTransaction } from './store.js';

/**
 * Closes a session and hands over what it held back: the queue is drained
 * into the summary, so those alerts are delivered once, on the way out.
 */
export async function closeSession(
  tx: FocusTransaction,
  session: FocusSession,
  nowMs: number,
): Promise<FocusSummary> {
  await tx.endSession(session.id, endedAt(session, nowMs));
  return summarize(session, nowMs, await tx.drainQueue());
}

async function resolveProfile(
  tx: FocusTransaction,
  profileId: string | undefined,
): Promise<Profile> {
  const profile =
    profileId === undefined ? await tx.defaultProfile() : await tx.getProfile(profileId);
  if (profile === null) {
    throw new NotFoundError('Profile not found');
  }
  return profile;
}

export function readFocusState(store: FocusStore, now: Date): Promise<FocusState> {
  return store.transaction(async (tx) => toFocusState(await tx.openSession(), now.getTime()));
}

/**
 * Starts a manual focus. A session already open is closed first, and only
 * the apps the new profile no longer mutes are restored, so switching
 * profiles never unmutes an app both of them mute.
 */
export function startFocus(
  store: FocusStore,
  request: FocusStart,
  now: Date,
  timeZone: string,
): Promise<FocusTransition> {
  const nowMs = now.getTime();
  return store.transaction(async (tx) => {
    await tx.lock();
    const profile = await resolveProfile(tx, request.profileId);
    const knownApps = await tx.listKnownApps(LIMITS.listSize);
    const muted = appsToMute(
      profile,
      knownApps.map((app) => app.appId),
    );
    const previous = await tx.openSession();
    const summary = previous === null ? null : await closeSession(tx, previous, nowMs);
    const session = await tx.startSession({
      profileId: profile.id,
      source: 'manual',
      startedAtMs: nowMs,
      endsAtMs: resolveEndsAt(request, nowMs, timeZone),
      mutedApps: muted,
    });
    return {
      state: toFocusState(session, nowMs),
      commands: switchMutes(previous?.mutedApps ?? [], muted),
      summary,
    };
  });
}

/** Stops the open session, restoring everything it muted. Stopping with none open changes nothing. */
export function stopFocus(store: FocusStore, now: Date): Promise<FocusTransition> {
  const nowMs = now.getTime();
  return store.transaction(async (tx) => {
    await tx.lock();
    const session = await tx.openSession();
    if (session === null) {
      return { state: { active: false }, commands: { mute: [], restore: [] }, summary: null };
    }
    const summary = await closeSession(tx, session, nowMs);
    return {
      state: { active: false },
      commands: switchMutes(session.mutedApps, []),
      summary,
    };
  });
}
