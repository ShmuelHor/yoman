import { LIMITS } from '@yoman/shared/limits';
import { describe, expect, it } from 'vitest';
import { toNotificationId } from '../../../../src/collectors/apps/domain/notification-id.js';

describe('toNotificationId', () => {
  it.each([
    ['org.gnome.Nautilus.desktop', 'org-gnome-nautilus'],
    ['firefox_firefox.desktop', 'firefox-firefox'],
    ['com.slack.Slack.desktop', 'com-slack-slack'],
    [
      'chrome-cinhimbnkkaeohfgghhklpknlkffjgod-Default.desktop',
      'chrome-cinhimbnkkaeohfgghhklpknlkffjgod-default',
    ],
    ['google-chrome.desktop', 'google-chrome'],
  ])('computes the GNOME notification ID of %s', (desktopId, expected) => {
    // Act
    const id = toNotificationId(desktopId);

    // Assert
    expect(id).toBe(expected);
  });

  it('collapses runs of disallowed characters into one dash, as GNOME Shell does', () => {
    // Act
    const id = toNotificationId('My  App..desktop');

    // Assert
    expect(id).toBe('my-app-');
  });

  it('rejects an ID longer than an app ID may be', () => {
    // Act
    const id = toNotificationId(`${'a'.repeat(LIMITS.appIdLength + 1)}.desktop`);

    // Assert
    expect(id).toBeUndefined();
  });

  it('rejects an empty ID', () => {
    // Act
    const id = toNotificationId('.desktop');

    // Assert
    expect(id).toBeUndefined();
  });
});
