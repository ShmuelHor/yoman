import { z } from 'zod';

/** UI languages (SPEC §6). Hebrew is the default. */
export const Language = z.enum(['he', 'en']);
export type Language = z.infer<typeof Language>;

export const DEFAULT_LANGUAGE: Language = 'he';

const DIRECTIONS: Readonly<Record<Language, 'rtl' | 'ltr'>> = { he: 'rtl', en: 'ltr' };

export function directionOf(language: Language): 'rtl' | 'ltr' {
  return DIRECTIONS[language];
}

/** Puts `lang` and `dir` on `<html>`, so the whole layout flips with the language. */
export function applyLanguage(root: HTMLElement, language: Language): void {
  root.lang = language;
  root.dir = directionOf(language);
}
