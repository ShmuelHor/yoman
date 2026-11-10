import { LIMITS } from '@yoman/shared/limits';
import { describe, expect, it } from 'vitest';
import {
  MAX_DESKTOP_FILE_BYTES,
  parseDesktopEntry,
} from '../../../../src/collectors/apps/domain/desktop-entry.js';

/** Longer than the parser accepts for any value. */
const OVERLONG = 2_000;

function desktopFile(...lines: string[]): string {
  return ['[Desktop Entry]', ...lines, ''].join('\n');
}

describe('parseDesktopEntry', () => {
  it('reads the name of an application', () => {
    // Arrange
    const text = desktopFile(
      'Type=Application',
      'Name=Slack',
      'Name[de]=Slack (de)',
      'Exec=slack %U',
    );

    // Act
    const entry = parseDesktopEntry(text);

    // Assert
    expect(entry).toEqual({ status: 'app', name: 'Slack' });
  });

  it('reads keys only from the [Desktop Entry] group', () => {
    // Arrange
    const text = [
      '# a comment',
      '[Desktop Action new-window]',
      'Name=New Window',
      '[Desktop Entry]',
      'Type=Application',
      'Name = Firefox',
    ].join('\n');

    // Act
    const entry = parseDesktopEntry(text);

    // Assert
    expect(entry).toEqual({ status: 'app', name: 'Firefox' });
  });

  it('unescapes spaces in values', () => {
    // Act
    const entry = parseDesktopEntry(desktopFile('Type=Application', 'Name=\\sVisual\\sCode'));

    // Assert
    expect(entry).toEqual({ status: 'app', name: 'Visual Code' });
  });

  it('truncates a long name to the contract length', () => {
    // Act
    const entry = parseDesktopEntry(
      desktopFile('Type=Application', `Name=${'n'.repeat(LIMITS.nameLength * 2)}`),
    );

    // Assert
    expect(entry).toEqual({ status: 'app', name: 'n'.repeat(LIMITS.nameLength) });
  });

  it('keeps a hidden helper that declares it sends notifications', () => {
    // Arrange
    const text = desktopFile(
      'Type=Application',
      'Name=Evolution Alarm Notify',
      'NoDisplay=true',
      'X-GNOME-UsesNotifications=true',
    );

    // Act
    const entry = parseDesktopEntry(text);

    // Assert
    expect(entry).toEqual({ status: 'app', name: 'Evolution Alarm Notify' });
  });

  it.each([
    ['a deleted entry', desktopFile('Type=Application', 'Name=Gone', 'Hidden=true')],
    [
      'a helper that is never shown',
      desktopFile('Type=Application', 'Name=Helper', 'NoDisplay=true'),
    ],
    ['a link', desktopFile('Type=Link', 'Name=Docs')],
    ['an entry without a name', desktopFile('Type=Application')],
    ['an entry without a type', desktopFile('Name=Slack')],
    ['a name with a control character', desktopFile('Type=Application', 'Name=a\\nb')],
    ['an invalid boolean', desktopFile('Type=Application', 'Name=Slack', 'Hidden=yes')],
    [
      'a name longer than any real one',
      desktopFile('Type=Application', `Name=${'n'.repeat(OVERLONG)}`),
    ],
    ['a file that is not a desktop entry', 'just some text'],
    [
      'an oversized file',
      desktopFile('Type=Application', 'Name=Big', `X-Pad=${'x'.repeat(MAX_DESKTOP_FILE_BYTES)}`),
    ],
  ])('masks %s', (_, text) => {
    // Act
    const entry = parseDesktopEntry(text);

    // Assert
    expect(entry).toEqual({ status: 'masked' });
  });
});
