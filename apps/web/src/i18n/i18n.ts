import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { applyLanguage, DEFAULT_LANGUAGE, Language } from './languages.js';
import type { Resources } from './resources.js';

/**
 * Creates the i18next instance and keeps `<html lang dir>` in sync with it.
 * Initialization is synchronous because every resource is bundled.
 */
export function createI18n(resources: Resources, root: HTMLElement): i18n {
  const instance = i18next.createInstance();
  instance.on('languageChanged', (language) => {
    const parsed = Language.safeParse(language);
    applyLanguage(root, parsed.success ? parsed.data : DEFAULT_LANGUAGE);
  });
  instance.use(initReactI18next);
  // With bundled resources and initAsync off, init finishes before it returns.
  void instance.init({
    resources,
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: Language.options,
    defaultNS: 'common',
    ns: Object.keys(resources[DEFAULT_LANGUAGE]),
    initAsync: false,
    // React already escapes every string it renders (SECURITY A6).
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}
