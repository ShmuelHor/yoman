import type { Profile } from '@yoman/shared/focus';
import { describe, expect, it } from 'vitest';

import { readAlertPolicy, replaceAlertPolicy } from '../../src/use-cases/alert-policy.js';
import { startFocus } from '../../src/use-cases/focus-sessions.js';
import { MAX_KNOWN_APPS, reportKnownApps } from '../../src/use-cases/known-apps.js';
import { deleteProfile } from '../../src/use-cases/manage-profiles.js';
import { createSchedule } from '../../src/use-cases/manage-schedules.js';
import { createMemoryStore } from '../memory-store.js';

const NOW = new Date('2026-11-08T10:00:00.000Z');
const profile: Profile = {
  id: '00000000-0000-4000-8000-0000000000aa',
  name: 'Deep work',
  mutedApps: [],
  exceptions: [],
  muteNewApps: true,
};

describe('reportKnownApps', () => {
  it('counts only new apps, refreshes known ones and reads a repeated app once', async () => {
    const store = createMemoryStore({
      knownApps: [
        {
          appId: 'slack',
          name: 'Slack',
          source: 'desktop',
          firstSeenAt: '2025-12-31T23:59:59.000Z',
        },
      ],
    });

    const added = await reportKnownApps(store, {
      items: [
        { appId: 'slack', name: null, source: 'gsettings' },
        { appId: 'spotify', name: 'Spotify', source: 'desktop' },
        { appId: 'spotify', name: 'Spotify 2', source: 'desktop' },
      ],
    });

    expect(added).toBe(1);
    expect(store.state().knownApps).toEqual([
      {
        appId: 'slack',
        name: 'Slack',
        source: 'gsettings',
        firstSeenAt: '2025-12-31T23:59:59.000Z',
      },
      {
        appId: 'spotify',
        name: 'Spotify 2',
        source: 'desktop',
        firstSeenAt: expect.any(String),
      },
    ]);
  });

  it('ignores new apps once the list is full', async () => {
    const knownApps = Array.from({ length: MAX_KNOWN_APPS }, (_, i) => ({
      appId: `app${i}`,
      name: null,
      source: 'desktop' as const,
    }));
    const store = createMemoryStore({ knownApps });

    const added = await reportKnownApps(store, {
      items: [{ appId: 'one-too-many', name: null, source: 'desktop' }],
    });

    expect(added).toBe(0);
    expect(store.state().knownApps).toHaveLength(MAX_KNOWN_APPS);
  });
});

describe('alert policy', () => {
  it('replaces the whole policy and reads it back in alert-type order', async () => {
    const store = createMemoryStore({ policy: [['battery-low', 'normal']] });

    const policy = await replaceAlertPolicy(store, {
      items: [
        { type: 'thermal', level: 'critical' },
        { type: 'battery-critical', level: 'normal' },
      ],
    });

    expect(policy).toEqual({
      items: [
        { type: 'battery-critical', level: 'normal' },
        { type: 'thermal', level: 'critical' },
      ],
    });
    expect(await readAlertPolicy(store)).toEqual(policy);
  });
});

describe('deleteProfile', () => {
  it('refuses to delete the profile of the open focus', async () => {
    const store = createMemoryStore({ profiles: [profile] });
    await startFocus(store, { minutes: 1 }, NOW, 'UTC');

    await expect(deleteProfile(store, profile.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(store.state().profiles).toEqual([profile]);
  });
});

describe('createSchedule', () => {
  it('answers 404 for a schedule of an unknown profile', async () => {
    const store = createMemoryStore();

    await expect(
      createSchedule(store, {
        profileId: profile.id,
        days: [0],
        start: '09:00',
        end: '12:00',
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
