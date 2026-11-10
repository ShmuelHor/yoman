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
