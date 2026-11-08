import { z } from 'zod';

import { Language } from './languages.js';

/** `{ he: { common: {...}, today: {...} }, en: {...} }`, the shape i18next expects. */
export type Resources = Record<Language, Record<string, TranslationTree>>;
export interface TranslationTree {
  readonly [key: string]: string | TranslationTree;
}

const TranslationTree: z.ZodType<TranslationTree> = z.lazy(() =>
  z.record(z.string(), z.union([z.string(), TranslationTree])),
);

/** A JSON module as Vite's glob import returns it. */
const JsonModule = z.object({ default: TranslationTree });

const FILE_PATTERN = /\/(?<language>[^/]+)\/(?<namespace>[a-z][a-z0-9-]*)\.json$/u;

/**
 * Builds i18next resources from `i18n/<language>/<namespace>.json` files. A page
 * owns one namespace, so a new page adds its own files and touches nothing shared.
 *
 * Every namespace must exist in every language: a missing file would show raw
 * keys in one language only, so it fails at startup instead.
 */
export function buildResources(modules: Readonly<Record<string, unknown>>): Resources {
  const resources: Resources = { he: {}, en: {} };
  for (const [file, module] of Object.entries(modules)) {
    const { language: code, namespace } = FILE_PATTERN.exec(file)?.groups ?? {};
    if (code === undefined || namespace === undefined) {
      throw new Error(`i18n file ${file} must be named <language>/<namespace>.json`);
    }
    const language = Language.safeParse(code);
    if (!language.success) {
      throw new Error(`i18n file ${file} uses an unknown language`);
    }
    resources[language.data][namespace] = JsonModule.parse(module).default;
  }
  assertSameNamespaces(resources);
  return resources;
}

function assertSameNamespaces(resources: Resources): void {
  const all = new Set(Language.options.flatMap((language) => Object.keys(resources[language])));
  for (const language of Language.options) {
    const missing = [...all].filter((namespace) => !(namespace in resources[language]));
    if (missing.length > 0) {
      throw new Error(`i18n namespaces missing for ${language}: ${missing.join(', ')}`);
    }
  }
}
