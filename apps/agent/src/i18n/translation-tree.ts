import { z } from 'zod';

/** A translation file: nested objects whose leaves are message templates. */
export interface TranslationTree {
  readonly [key: string]: string | TranslationTree;
}

/** Keys are identifiers, so a dotted key path can never be ambiguous. */
const TranslationKey = z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,63}$/);
/** Far above any real message, but bounded like every other parsed input. */
const MAX_MESSAGE_LENGTH = 1_024;

export const TranslationTree: z.ZodType<TranslationTree> = z.lazy(() =>
  z.record(TranslationKey, z.union([z.string().min(1).max(MAX_MESSAGE_LENGTH), TranslationTree])),
);

/** The message at a dotted key path, or `undefined` when the path is missing or not a leaf. */
export function lookupMessage(tree: TranslationTree, key: string): string | undefined {
  let node: string | TranslationTree | undefined = tree;
  for (const segment of key.split('.')) {
    if (node === undefined || typeof node === 'string' || !Object.hasOwn(node, segment)) {
      return undefined;
    }
    node = node[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

/** The result of filling a template: the text, plus every placeholder that had no value. */
export interface Interpolated {
  readonly text: string;
  readonly missing: readonly string[];
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/gu;
/** Shown in place of a value that never arrived, so the rest of the message still reads. */
export const MISSING_VALUE = '?';

/**
 * Replaces each `{{name}}` with its value. The syntax matches i18next, so the
 * web and the agent can share message templates. Values are inserted as is;
 * escaping is up to whoever renders the text.
 */
export function interpolate(
  template: string,
  values: Readonly<Record<string, string>>,
): Interpolated {
  const missing: string[] = [];
  const text = template.replace(PLACEHOLDER, (_match, name: string) => {
    if (Object.hasOwn(values, name)) {
      return values[name] ?? MISSING_VALUE;
    }
    missing.push(name);
    return MISSING_VALUE;
  });
  return { text, missing };
}
