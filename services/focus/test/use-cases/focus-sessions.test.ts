import type { Alert } from '@yoman/shared/alerts';
import type { Profile } from '@yoman/shared/focus';
import { describe, expect, it } from 'vitest';

import { FocusTransition } from '../../src/contracts.js';
import { readFocusState, startFocus, stopFocus } from '../../src/use-cases/focus-sessions.js';
import { routeIncoming } from '../../src/use-cases/route-alerts.js';
import { createMemoryStore } from '../memory-store.js';

const MINUTE_MS = 60_000;
const FOCUS_MINUTES = 30;
const QUEUED_AT_MINUTE = 5;
const STOPPED_AT_MINUTE = 10;
const NOW = new Date('2026-11-08T10:00:00.000Z');
const ZONE = 'Asia/Jerusalem';

const deepWork: Profile = {
  id: '00000000-0000-4000-8000-0000000000aa',
  name: 'Deep work',
  mutedApps: ['slack'],
  exceptions: ['thunderbird'],
  muteNewApps: true,
};
const calls: Profile = {
  id: '00000000-0000-4000-8000-0000000000bb',
  name: 'Calls',
  mutedApps: ['spotify', 'slack'],
  exceptions: [],
  muteNewApps: false,
};

const knownApps = ['org.telegram.desktop', 'slack', 'thunderbird', 'spotify'].map((appId) => ({
  appId,
  name: null,
  source: 'desktop' as const,
}));

function later(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * MINUTE_MS);
}

const importantAlert: Alert = {
  alertKey: 'battery-low:15',
  type: 'battery-low',
  level: 'important',
  ts: NOW.toISOString(),
  params: { percent: 14 },
};

function givenStore(): ReturnType<typeof createMemoryStore> {
  return createMemoryStore({ profiles: [deepWork, calls], knownApps });
}

describe('startFocus', () => {
  it("mutes the profile's apps and every known app except exceptions", async () => {
    const store = givenStore();

    const change = await startFocus(store, { minutes: FOCUS_MINUTES }, NOW, ZONE);

    expect(FocusTransition.parse(change)).toEqual({
      state: {
        active: true,
        profileId: deepWork.id,
        source: 'manual',
        startedAt: NOW.toISOString(),
        endsAt: later(FOCUS_MINUTES).toISOString(),
      },
      commands: { mute: ['org.telegram.desktop', 'slack', 'spotify'], restore: [] },
      summary: null,
    });
  });

  it('switches profiles restoring only what the new one leaves unmuted', async () => {
    const store = givenStore();
    await startFocus(store, { minutes: FOCUS_MINUTES }, NOW, ZONE);

    const change = await startFocus(store, { profileId: calls.id, until: '13:00' }, later(1), ZONE);

    expect(change.commands).toEqual({
      mute: ['slack', 'spotify'],
      restore: ['org.telegram.desktop'],
    });
    expect(change.state).toMatchObject({ profileId: calls.id, endsAt: '2026-11-08T11:00:00.000Z' });
    expect(change.summary?.endedAt).toBe(later(1).toISOString());
    expect(store.state().sessions.filter((s) => s.endedAtMs === null)).toHaveLength(1);
  });

  it('answers 404 for an unknown profile, or when there is no profile at all', async () => {
    await expect(
      startFocus(
        givenStore(),
        { profileId: '00000000-0000-4000-8000-0000000000ff', minutes: 1 },
        NOW,
        ZONE,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(startFocus(createMemoryStore(), { minutes: 1 }, NOW, ZONE)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('stopFocus', () => {
  it('restores everything the session muted and hands over the queued alerts', async () => {
    const store = givenStore();
    await startFocus(store, { minutes: FOCUS_MINUTES }, NOW, ZONE);
    await routeIncoming(store, { alerts: [importantAlert] }, later(QUEUED_AT_MINUTE));

    const change = await stopFocus(store, later(STOPPED_AT_MINUTE));

    expect(FocusTransition.parse(change)).toEqual({
      state: { active: false },
      commands: { mute: [], restore: ['org.telegram.desktop', 'slack', 'spotify'] },
      summary: {
        profileId: deepWork.id,
        startedAt: NOW.toISOString(),
        endedAt: later(STOPPED_AT_MINUTE).toISOString(),
        alerts: [{ alert: importantAlert, queuedAt: later(QUEUED_AT_MINUTE).toISOString() }],
      },
    });
    expect(store.state().queue).toEqual([]);
    expect(await readFocusState(store, later(STOPPED_AT_MINUTE))).toEqual({ active: false });
  });

  it('changes nothing when no focus is open', async () => {
    const change = await stopFocus(givenStore(), NOW);

    expect(change).toEqual({
      state: { active: false },
      commands: { mute: [], restore: [] },
      summary: null,
    });
  });
});

describe('readFocusState', () => {
  it('reports a session as over once its end time has come, before anything closes it', async () => {
    const store = givenStore();
    await startFocus(store, { minutes: FOCUS_MINUTES }, NOW, ZONE);

    expect(await readFocusState(store, later(FOCUS_MINUTES - 1))).toMatchObject({ active: true });
    expect(await readFocusState(store, later(FOCUS_MINUTES))).toEqual({ active: false });
  });
});
