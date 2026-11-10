import { LIMITS } from '@yoman/shared/limits';
import { describe, expect, it } from 'vitest';
import { toAppId } from '../../../../src/collectors/window/domain/app-id.js';

describe('toAppId', () => {
  it('keeps a wm_class that is already a valid app ID, case included', () => {
    // Act / Assert
    expect(toAppId('org.gnome.Nautilus')).toBe('org.gnome.Nautilus');
  });

  it('turns each run of disallowed characters into one dash', () => {
    // Act / Assert
    expect(toAppId('Microsoft  Teams/Preview')).toBe('Microsoft-Teams-Preview');
  });

  it('drops dashes left at either edge', () => {
    // Act / Assert
    expect(toAppId(' "app/name" ')).toBe('app-name');
  });

  it('cuts a long wm_class to the app ID limit', () => {
    // Act
    const appId = toAppId('a'.repeat(LIMITS.appIdLength * 2));

    // Assert
    expect(appId).toHaveLength(LIMITS.appIdLength);
  });

  it.each(['', '   ', '"/\'', '\u00e9\u00e8'])(
    'returns undefined when nothing usable is left (%j)',
    (raw) => {
      // Act / Assert
      expect(toAppId(raw)).toBeUndefined();
    },
  );
});
