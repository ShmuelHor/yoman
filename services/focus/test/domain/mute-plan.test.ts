import { LIMITS } from '@yoman/shared/limits';
import { describe, expect, it } from 'vitest';

import { appsToMute, switchMutes } from '../../src/domain/mute-plan.js';

const KNOWN = ['org.telegram.desktop', 'slack', 'thunderbird', 'spotify'];

describe('appsToMute', () => {
  it('mutes only the listed apps when new apps are not muted by default', () => {
    const profile = {
      mutedApps: ['slack', 'org.telegram.desktop'],
      exceptions: [],
      muteNewApps: false,
    };

    expect(appsToMute(profile, KNOWN)).toEqual(['org.telegram.desktop', 'slack']);
  });

  it('mutes the new apps too when new apps are muted by default', () => {
    const profile = { mutedApps: [], exceptions: [], muteNewApps: true };

    expect(appsToMute(profile, KNOWN)).toEqual([...KNOWN].sort());
  });

  it('never mutes an exception, even one also listed as muted', () => {
    const profile = {
      mutedApps: ['slack'],
      exceptions: ['slack', 'thunderbird'],
      muteNewApps: true,
    };

    expect(appsToMute(profile, KNOWN)).toEqual(['org.telegram.desktop', 'spotify']);
  });

  it('never mutes a system app, whatever the ID form or where it came from', () => {
    const profile = {
      mutedApps: ['org-gnome-settings', 'slack'],
      exceptions: [],
      muteNewApps: true,
    };

    expect(
      appsToMute(profile, ['org.gnome.Nautilus', 'firmware-updater-firmware-updater']),
    ).toEqual(['slack']);
  });

  it('mutes a listed app the agent has not discovered yet', () => {
    const profile = { mutedApps: ['discord'], exceptions: [], muteNewApps: true };

    expect(appsToMute(profile, KNOWN)).toContain('discord');
  });

  it('caps the result at the contract list size', () => {
    const many = Array.from({ length: LIMITS.listSize + 1 }, (_, i) => `app${i}`);
    const profile = { mutedApps: [], exceptions: [], muteNewApps: true };

    expect(appsToMute(profile, many)).toHaveLength(LIMITS.listSize);
  });
});

describe('switchMutes', () => {
  it('restores only the apps the next set no longer mutes', () => {
    expect(switchMutes(['slack', 'spotify'], ['spotify', 'thunderbird'])).toEqual({
      mute: ['spotify', 'thunderbird'],
      restore: ['slack'],
    });
  });

  it('restores everything on a stop', () => {
    expect(switchMutes(['spotify', 'slack'], [])).toEqual({
      mute: [],
      restore: ['slack', 'spotify'],
    });
  });
});
