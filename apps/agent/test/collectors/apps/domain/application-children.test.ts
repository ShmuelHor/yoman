import { LIMITS } from '@yoman/shared/limits';
import { describe, expect, it } from 'vitest';
import {
  MAX_GSETTINGS_OUTPUT_LENGTH,
  parseApplicationChildren,
} from '../../../../src/collectors/apps/domain/application-children.js';

describe('parseApplicationChildren', () => {
  it('reads every notification ID in the list', () => {
    // Act
    const ids = parseApplicationChildren("['firefox-firefox', 'org-gnome-nautilus']\n");

    // Assert
    expect(ids).toEqual(['firefox-firefox', 'org-gnome-nautilus']);
  });

  it.each(['@as []\n', '[]'])('reads %j as no apps', (stdout) => {
    // Act
    const ids = parseApplicationChildren(stdout);

    // Assert
    expect(ids).toEqual([]);
  });

  it('skips items that are not notification IDs', () => {
    // Act
    const ids = parseApplicationChildren("['slack', 'Bad Id', 'a\\', \\'b', 'slack']");

    // Assert
    expect(ids).toEqual(['slack']);
  });

  it.each([
    ['not a list', 'No such key'],
    ['not a string', LIMITS.pid],
    ['oversized', `['${'a'.repeat(MAX_GSETTINGS_OUTPUT_LENGTH)}']`],
  ])('rejects output that is %s', (_, stdout) => {
    // Act
    const ids = parseApplicationChildren(stdout);

    // Assert
    expect(ids).toBeUndefined();
  });
});
