import { describe, expect, it } from 'vitest';

import { isNeverMuted, withoutNeverMuted } from '../../src/core/never-muted.js';

describe('isNeverMuted', () => {
  it.each([
    'gnome-shell',
    'gnome-terminal',
    'org.gnome.Shell',
    'org.gnome.Settings',
    'update-manager',
    'yoman',
  ])('never mutes the built-in system app %s', (app) => {
    expect(isNeverMuted(app, [])).toBe(true);
  });

  it.each(['GNOME-Shell', 'ORG.GNOME.Shell', 'Update-Manager', 'YOMAN'])(
    'ignores case: %s',
    (app) => {
      expect(isNeverMuted(app, [])).toBe(true);
    },
  );

  it('never mutes an app on the settings list, whatever its case', () => {
    expect(isNeverMuted('Telegram', ['telegram'])).toBe(true);
    expect(isNeverMuted('telegram', ['Telegram'])).toBe(true);
  });

  it('allows other apps, including look-alikes of the built-in names', () => {
    expect(isNeverMuted('slack', ['telegram'])).toBe(false);
    expect(isNeverMuted('gnomeish', [])).toBe(false);
    expect(isNeverMuted('org.gnomeish.App', [])).toBe(false);
    expect(isNeverMuted('yoman-notes', [])).toBe(false);
  });
});

describe('withoutNeverMuted', () => {
  it('drops system apps from the mute commands and keeps the state and restores', () => {
    const change = {
      state: { active: false as const },
      commands: { mute: ['slack', 'org.gnome.Shell', 'Telegram'], restore: ['org.gnome.Shell'] },
    };

    expect(withoutNeverMuted(change, ['telegram'])).toEqual({
      state: { active: false },
      commands: { mute: ['slack'], restore: ['org.gnome.Shell'] },
    });
  });
});
