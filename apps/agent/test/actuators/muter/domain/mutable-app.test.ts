import { SYSTEM_APP_IDS, USER_APP_IDS } from '@yoman/shared/fixtures/known-apps-catalog';
import { describe, expect, it } from 'vitest';
import { checkMutable } from '../../../../src/actuators/muter/domain/mutable-app.js';

const TOO_LONG = 129;

describe('checkMutable', () => {
  it('allows an ordinary app', () => {
    expect(checkMutable('org.slack.Slack', [])).toEqual({ mutable: true });
  });

  it.each(['update-manager', 'gnome-terminal', 'org.gnome.Nautilus', 'yoman', 'Yoman'])(
    'never mutes the built-in system app %s',
    (appId) => {
      expect(checkMutable(appId, [])).toEqual({ mutable: false, reason: 'system-app' });
    },
  );

  it.each(SYSTEM_APP_IDS)('refuses the dashed system app %s the collector reports', (appId) => {
    expect(checkMutable(appId, [])).toEqual({ mutable: false, reason: 'system-app' });
  });

  it('allows Telegram from the same catalog', () => {
    expect(checkMutable(USER_APP_IDS[0], [])).toEqual({ mutable: true });
  });

  it('matches the settings system list across the dotted and dashed forms', () => {
    expect(checkMutable('org-telegram-desktop', ['org.telegram.desktop'])).toEqual({
      mutable: false,
      reason: 'system-app',
    });
  });

  it('never mutes an app on the settings system list, ignoring case', () => {
    expect(checkMutable('Signal', ['signal'])).toEqual({ mutable: false, reason: 'system-app' });
  });

  it.each(['a;b', '$(id)', 'two words', '', '../x', 'a`b`', 'x'.repeat(TOO_LONG)])(
    'rejects the malformed id %j',
    (appId) => {
      expect(checkMutable(appId, [])).toEqual({ mutable: false, reason: 'invalid-app-id' });
    },
  );
});
