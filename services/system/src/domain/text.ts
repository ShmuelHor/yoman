const NUL = '\u0000';
const REPLACEMENT_CHARACTER = '�';

/**
 * Postgres `text` and `jsonb` cannot hold U+0000 and fail the whole statement
 * on it. A process name is untrusted and may contain one, so it is kept with
 * the replacement character instead, before it is stored or compared; the
 * length stays the same.
 */
export function withoutNul(value: string): string {
  return value.replaceAll(NUL, REPLACEMENT_CHARACTER);
}
