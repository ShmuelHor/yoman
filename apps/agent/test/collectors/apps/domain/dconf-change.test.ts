import { describe, expect, it } from 'vitest';
import { touchesApplicationChildren } from '../../../../src/collectors/apps/domain/dconf-change.js';

/** Longer than any dconf path. */
const OVERLONG_PATH = 2_048;

describe('touchesApplicationChildren', () => {
  it.each([
    ['the key itself', ['/org/gnome/desktop/notifications/application-children', [''], 'tag']],
    [
      'the key among changes',
      [
        '/org/gnome/desktop/',
        ['interface/clock-format', 'notifications/application-children'],
        'tag',
      ],
    ],
    ['a reset of a directory above it', ['/org/gnome/desktop/notifications/', [''], 'tag']],
    ['a reset of everything', ['/', [''], 'tag']],
  ])('is true for %s', (_, body) => {
    // Act
    const relevant = touchesApplicationChildren(body);

    // Assert
    expect(relevant).toBe(true);
  });

  it.each([
    ['another key', ['/org/gnome/desktop/interface/clock-format', [''], 'tag']],
    [
      'an app setting below it',
      ['/org/gnome/desktop/notifications/application/slack/show-banners', [''], 'tag'],
    ],
  ])('is false for %s', (_, body) => {
    // Act
    const relevant = touchesApplicationChildren(body);

    // Assert
    expect(relevant).toBe(false);
  });

  it.each([
    ['an empty body', []],
    ['the wrong types', [true, false, null]],
    ['an oversized path', ['/'.repeat(OVERLONG_PATH), [''], 'tag']],
  ])('rejects %s', (_, body) => {
    // Act
    const relevant = touchesApplicationChildren(body);

    // Assert
    expect(relevant).toBeUndefined();
  });
});
