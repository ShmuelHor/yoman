import { describe, expect, it } from 'vitest';
import type { DesktopEntry } from '../../../../src/collectors/apps/domain/desktop-entry.js';
import {
  buildKnownApps,
  type DirectoryListing,
  newApps,
} from '../../../../src/collectors/apps/domain/known-apps.js';

const MASKED: DesktopEntry = { status: 'masked' };

function app(name: string): DesktopEntry {
  return { status: 'app', name };
}

function listing(entries: Record<string, DesktopEntry>): DirectoryListing {
  return new Map(Object.entries(entries));
}

describe('buildKnownApps', () => {
  it('lists every Chrome web app apart from Chrome itself', () => {
    // Arrange
    const user = listing({
      'chrome-cinhimbnkkaeohfgghhklpknlkffjgod-Default.desktop': app('YouTube Music'),
      'chrome-agimnkijcaahngcdmfeangaknmldooml-Profile_1.desktop': app('YouTube'),
    });
    const system = listing({ 'google-chrome.desktop': app('Google Chrome') });

    // Act
    const apps = buildKnownApps([user, system], []);

    // Assert
    expect(apps).toEqual([
      {
        appId: 'chrome-agimnkijcaahngcdmfeangaknmldooml-profile-1',
        name: 'YouTube',
        source: 'desktop',
      },
      {
        appId: 'chrome-cinhimbnkkaeohfgghhklpknlkffjgod-default',
        name: 'YouTube Music',
        source: 'desktop',
      },
      { appId: 'google-chrome', name: 'Google Chrome', source: 'desktop' },
    ]);
  });

  it('lets a higher directory override the same desktop file ID', () => {
    // Arrange
    const user = listing({ 'slack.desktop': app('Slack (custom)') });
    const system = listing({ 'slack.desktop': app('Slack') });

    // Act
    const apps = buildKnownApps([user, system], []);

    // Assert
    expect(apps).toEqual([{ appId: 'slack', name: 'Slack (custom)', source: 'desktop' }]);
  });

  it('drops a system app the user deleted with a hidden copy', () => {
    // Arrange
    const user = listing({ 'slack.desktop': MASKED });
    const system = listing({ 'slack.desktop': app('Slack') });

    // Act
    const apps = buildKnownApps([user, system], []);

    // Assert
    expect(apps).toEqual([]);
  });

  it('lists apps GNOME saw notify that have no desktop file, without a name', () => {
    // Arrange
    const system = listing({ 'org.gnome.Nautilus.desktop': app('Files') });

    // Act
    const apps = buildKnownApps([system], ['org-gnome-nautilus', 'teams-for-linux']);

    // Assert
    expect(apps).toEqual([
      { appId: 'org-gnome-nautilus', name: 'Files', source: 'desktop' },
      { appId: 'teams-for-linux', name: null, source: 'gsettings' },
    ]);
  });

  it('keeps the first of two desktop files that map to the same ID', () => {
    // Arrange
    const system = listing({ 'Foo.desktop': app('Foo'), 'foo.desktop': app('foo') });

    // Act
    const apps = buildKnownApps([system], []);

    // Assert
    expect(apps).toEqual([{ appId: 'foo', name: 'Foo', source: 'desktop' }]);
  });
});

describe('newApps', () => {
  it('returns only apps that were not known before', () => {
    // Arrange
    const slack = { appId: 'slack', name: 'Slack', source: 'desktop' } as const;
    const zoom = { appId: 'zoom', name: 'Zoom', source: 'desktop' } as const;

    // Act
    const added = newApps([slack], [slack, zoom]);

    // Assert
    expect(added).toEqual([zoom]);
  });
});
