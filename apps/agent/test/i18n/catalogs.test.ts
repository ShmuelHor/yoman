import { notificationKeys, notificationMessages } from '@yoman/shared/notifications';
import { Language } from '@yoman/shared/settings';
import { describe, expect, it } from 'vitest';
import { catalogs, translate } from '../../src/i18n/catalogs.js';
import { lookupMessage, type TranslationTree } from '../../src/i18n/translation-tree.js';

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/gu;

function placeholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '').sort();
}

describe('agent translation catalogs', () => {
  it.each(Language.options)('has every shared notification key in %s', (language) => {
    const missing = notificationKeys.filter(
      (key) => lookupMessage(catalogs[language], key) === undefined,
    );

    expect(missing).toEqual([]);
  });

  it.each(Language.options)('has the notifier chrome in %s', (language) => {
    expect(lookupMessage(catalogs[language], 'notifications.appName')).toBeDefined();
    expect(lookupMessage(catalogs[language], 'notifications.action.openDashboard')).toBeDefined();
  });

  it.each(Language.options)('uses exactly the shared params in every %s body', (language) => {
    for (const message of Object.values(notificationMessages)) {
      const body = lookupMessage(catalogs[language], message.body) ?? '';

      expect(placeholders(body), message.body).toEqual([...message.params].sort());
    }
  });

  it('uses no placeholders in titles, which are plain text', () => {
    for (const language of Language.options) {
      for (const message of Object.values(notificationMessages)) {
        expect(lookupMessage(catalogs[language], message.title)).not.toMatch(PLACEHOLDER);
      }
    }
  });
});

describe('translate', () => {
  const partial: Readonly<Record<Language, TranslationTree>> = {
    he: { greeting: 'shalom' },
    en: { greeting: 'hello', onlyEnglish: 'english only' },
  };

  it('returns the message in the requested language', () => {
    expect(translate('greeting', 'en', partial)).toBe('hello');
  });

  it('falls back to the default language when a key is missing', () => {
    const fallback = { he: { onlyHebrew: 'hebrew only' }, en: {} };

    expect(translate('onlyHebrew', 'en', fallback)).toBe('hebrew only');
  });

  it('falls back to the key itself when no language has it', () => {
    expect(translate('nowhere.at.all', 'he', partial)).toBe('nowhere.at.all');
  });

  it('reads the bundled catalogs by default', () => {
    expect(translate('notifications.batteryLow.title', 'en')).toBe('Battery low');
  });
});
