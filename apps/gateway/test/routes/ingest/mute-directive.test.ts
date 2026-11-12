import { focusActiveFixture, profileFixture } from '@yoman/shared/fixtures/data';
import { describe, expect, it } from 'vitest';

import { buildMuteDirective } from '../../../src/routes/ingest/mute-directive.js';

describe('buildMuteDirective', () => {
  it('mutes the profile apps until the focus session ends', () => {
    const directive = buildMuteDirective(focusActiveFixture, [profileFixture], []);

    expect(directive).toEqual({
      mute: ['discord', 'slack'],
      restore: [],
      endsAt: focusActiveFixture.active ? focusActiveFixture.endsAt : undefined,
      systemApps: [],
    });
  });

  it('also mutes known apps the profile does not list when it mutes new apps', () => {
    const profile = { ...profileFixture, muteNewApps: true, exceptions: ['signal'] };

    const directive = buildMuteDirective(
      focusActiveFixture,
      [profile],
      ['gnome-shell'],
      ['telegram', 'slack', 'signal', 'gnome-shell'],
    );

    expect(directive.mute).toEqual(['discord', 'slack', 'telegram']);
  });

  it('ignores known apps when the profile does not mute new apps', () => {
    const profile = { ...profileFixture, muteNewApps: false };

    const directive = buildMuteDirective(focusActiveFixture, [profile], [], ['telegram']);

    expect(directive.mute).toEqual(['discord', 'slack']);
  });

  it('never mutes a system app or a profile exception', () => {
    const profile = { ...profileFixture, exceptions: ['discord'] };

    const directive = buildMuteDirective(focusActiveFixture, [profile], ['slack']);

    expect(directive.mute).toEqual([]);
    expect(directive.systemApps).toEqual(['slack']);
  });

  it('mutes nothing when the active profile is not found', () => {
    expect(buildMuteDirective(focusActiveFixture, [], []).mute).toEqual([]);
  });

  it('sends no commands and no end time when focus is off', () => {
    const directive = buildMuteDirective({ active: false }, [profileFixture], ['gnome-shell']);

    expect(directive).toEqual({ mute: [], restore: [], systemApps: ['gnome-shell'] });
  });
});
