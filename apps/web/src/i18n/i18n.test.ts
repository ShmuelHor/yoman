// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { createI18n } from './i18n.js';
import type { Resources } from './resources.js';

const resources: Resources = {
  he: { common: { greeting: 'shalom' } },
  en: { common: { greeting: 'hello' } },
};

describe('createI18n', () => {
  it('starts in Hebrew, right to left', () => {
    const root = document.createElement('html');

    const i18n = createI18n(resources, root);

    expect(i18n.language).toBe('he');
    expect(i18n.t('greeting')).toBe('shalom');
    expect([root.lang, root.dir]).toEqual(['he', 'rtl']);
  });

  it('flips lang and dir on <html> when the language changes', async () => {
    const root = document.createElement('html');
    const i18n = createI18n(resources, root);

    await i18n.changeLanguage('en');
    expect([root.lang, root.dir, i18n.t('greeting')]).toEqual(['en', 'ltr', 'hello']);

    await i18n.changeLanguage('he');
    expect([root.lang, root.dir]).toEqual(['he', 'rtl']);
  });

  it('falls back to Hebrew for an unsupported language', async () => {
    const root = document.createElement('html');
    const i18n = createI18n(resources, root);

    await i18n.changeLanguage('fr');

    expect([root.lang, root.dir]).toEqual(['he', 'rtl']);
  });
});
