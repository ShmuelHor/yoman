import { describe, expect, it } from 'vitest';
import {
  AlertPolicy,
  AlertQueue,
  FocusChange,
  FocusStart,
  FocusState,
  KnownAppList,
  KnownAppsResult,
  Profile,
  ProfileInput,
} from './focus.js';

const id = '0b7f8c3e-2c55-4b8e-9f3e-1d2a3b4c5d6e';
const profile = {
  name: 'Deep work',
  mutedApps: ['slack'],
  exceptions: ['org.gnome.Calendar'],
  muteNewApps: true,
};
const active = {
  active: true,
  profileId: id,
  source: 'manual',
  startedAt: '2026-11-08T10:00:00Z',
  endsAt: '2026-11-08T11:00:00Z',
};

describe('focus', () => {
  it('accepts profiles, states, starts, changes, queues, known apps and policy', () => {
    expect(ProfileInput.safeParse(profile).success).toBe(true);
    expect(Profile.safeParse({ id, ...profile }).success).toBe(true);
    expect(FocusState.safeParse({ active: false }).success).toBe(true);
    expect(FocusState.safeParse(active).success).toBe(true);
    expect(FocusStart.safeParse({ minutes: 25 }).success).toBe(true);
    expect(FocusStart.safeParse({ profileId: id, until: '17:30' }).success).toBe(true);
    expect(
      FocusChange.safeParse({ state: active, commands: { mute: ['slack'], restore: [] } }).success,
    ).toBe(true);
    expect(AlertQueue.safeParse({ items: [] }).success).toBe(true);
    expect(
      KnownAppList.safeParse({ items: [{ appId: 'slack', name: 'Slack', source: 'desktop' }] })
        .success,
    ).toBe(true);
    expect(KnownAppsResult.safeParse({ added: 1 }).success).toBe(true);
    expect(
      AlertPolicy.safeParse({ items: [{ type: 'thermal', level: 'important' }] }).success,
    ).toBe(true);
  });

  it('rejects invalid starts, states and policies', () => {
    expect(FocusStart.safeParse({}).success).toBe(false);
    expect(FocusStart.safeParse({ minutes: 25, until: '17:30' }).success).toBe(false);
    expect(FocusStart.safeParse({ minutes: 721 }).success).toBe(false);
    expect(FocusStart.safeParse({ until: '5pm' }).success).toBe(false);
    expect(FocusState.safeParse({ active: true }).success).toBe(false);
    expect(FocusState.safeParse({ active: false, profileId: id }).success).toBe(false);
    expect(ProfileInput.safeParse({ ...profile, mutedApps: ['bad app'] }).success).toBe(false);
    expect(
      AlertPolicy.safeParse({
        items: [
          { type: 'thermal', level: 'important' },
          { type: 'thermal', level: 'critical' },
        ],
      }).success,
    ).toBe(false);
  });
});
