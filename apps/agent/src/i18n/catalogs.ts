import type { Language } from '@yoman/shared/settings';
import enNotifications from './en/notifications.json' with { type: 'json' };
import heNotifications from './he/notifications.json' with { type: 'json' };
import { lookupMessage, TranslationTree } from './translation-tree.js';

/** Hebrew is the product's default language (CLAUDE.md, i18n). */
export const DEFAULT_LANGUAGE: Language = 'he';

/**
 * Every agent translation, keyed by namespace the way the shared i18n keys
 * are (`notifications.batteryLow.title`). Parsed at load, so a broken file
 * fails at startup instead of on the first notification.
 */
export const catalogs: Readonly<Record<Language, TranslationTree>> = {
  he: { notifications: TranslationTree.parse(heNotifications) },
  en: { notifications: TranslationTree.parse(enNotifications) },
};

/**
 * The message for `key` in `language`. A key missing in one language falls
 * back to the default language, then to the key itself, so a gap shows up as
 * a readable key instead of an empty notification.
 */
export function translate(
  key: string,
  language: Language,
  from: Readonly<Record<Language, TranslationTree>> = catalogs,
): string {
  return lookupMessage(from[language], key) ?? lookupMessage(from[DEFAULT_LANGUAGE], key) ?? key;
}
