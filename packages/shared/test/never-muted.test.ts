import { describe, expect, it } from 'vitest';

import { SYSTEM_APP_IDS, USER_APP_IDS } from '../src/fixtures/known-apps-catalog.js';
import { isBuiltInNeverMuted, isSameApp, normalizeAppId } from '../src/never-muted.js';

describe('isBuiltInNeverMuted', () => {
  it.each(SYSTEM_APP_IDS)('never mutes the system app %s', (app) => {
    expect(isBuiltInNeverMuted(app)).toBe(true);
  });

  it.each([
    'org.gnome.Settings',
    'ORG.GNOME.Shell',
    'org.freedesktop.Tracker3',
    'io.snapcraft.SessionAgent',
    'Update-Manager',
    'GNOME-Terminal',
  ])('never mutes the dotted or upper-case form %s', (app) => {
    expect(isBuiltInNeverMuted(app)).toBe(true);
  });

  it.each([...USER_APP_IDS, 'org.telegram.desktop', 'gnomeish', 'org-gnomeish-app', 'yoman-notes'])(
    'allows %s',
    (app) => {
      expect(isBuiltInNeverMuted(app)).toBe(false);
    },
  );
});

describe('isSameApp', () => {
  it('treats dots, dashes and case as one form', () => {
    expect(normalizeAppId('Org.Gnome.Settings')).toBe('org-gnome-settings');
    expect(isSameApp('org.gnome.Settings', 'org-gnome-settings')).toBe(true);
    expect(isSameApp('slack', 'zoom')).toBe(false);
  });
});
