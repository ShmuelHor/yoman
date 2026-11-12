import type { Settings } from '@yoman/shared/settings';

import { DEFAULT_SETTINGS, type SettingsStore } from '../src/core/settings-store.js';

/** `gateway.settings` without a database: what the last write stored. */
export function memorySettings(initial = DEFAULT_SETTINGS): SettingsStore {
  let stored = initial;
  return {
    read: () => Promise.resolve(stored),
    write: (settings): Promise<Settings> => {
      stored = settings;
      return Promise.resolve(stored);
    },
  };
}
