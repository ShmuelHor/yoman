import { LIMITS } from '@yoman/shared/limits';
import { z } from 'zod';

/** Real `.desktop` files are a few kB, translations included; a larger one is not trusted. */
export const MAX_DESKTOP_FILE_BYTES = 65_536;
/** Longer values are rejected, not truncated, so a crafted file cannot smuggle a huge name. */
const MAX_VALUE_LENGTH = 1_024;

const MAIN_GROUP = '[Desktop Entry]';
/** Only the keys the catalog needs are read; every other key, translations too, is ignored. */
const KEYS = new Set(['Type', 'Name', 'Hidden', 'NoDisplay', 'X-GNOME-UsesNotifications']);
const KEY_VALUE = /^([A-Za-z0-9-]+)\s*=\s*(.*)$/;
const ESCAPES: Readonly<Record<string, string>> = { s: ' ', n: '\n', t: '\t', r: '\r', '\\': '\\' };
const ESCAPE = /\\([sntr\\])/g;

const Flag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

/** Control characters, escaped newlines included, have no place in an app name. */
const Name = z
  .string()
  .trim()
  .min(1)
  .max(MAX_VALUE_LENGTH)
  .regex(/^[^\p{Cc}]*$/u);

const RawDesktopEntry = z.object({
  Type: z.string().max(MAX_VALUE_LENGTH),
  Name,
  Hidden: Flag,
  NoDisplay: Flag,
  'X-GNOME-UsesNotifications': Flag,
});

export type DesktopEntry =
  /** An app GNOME lists, and so one that can send notifications. */
  | { readonly status: 'app'; readonly name: string }
  /**
   * Deleted (`Hidden`), not an application, a helper that is never shown, or
   * a file that does not parse. It still masks the same ID in a lower directory.
   */
  | { readonly status: 'masked' };

const MASKED: DesktopEntry = { status: 'masked' };

function unescapeValue(value: string): string {
  return value.replace(ESCAPE, (_, code: string) => ESCAPES[code] ?? code);
}

/** The keys of the `[Desktop Entry]` group; the first occurrence of a key wins. */
function mainGroup(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let inMain = false;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      inMain = trimmed === MAIN_GROUP;
      continue;
    }
    const match = inMain ? KEY_VALUE.exec(trimmed) : null;
    const key = match?.[1];
    const value = match?.[2];
    if (key !== undefined && value !== undefined && KEYS.has(key) && !(key in fields)) {
      fields[key] = unescapeValue(value);
    }
  }
  return fields;
}

/**
 * Parses an untrusted `.desktop` file (Desktop Entry Specification 1.5) into
 * what the app catalog needs. Anything oversized or malformed masks the ID
 * instead of failing the scan.
 */
export function parseDesktopEntry(text: string): DesktopEntry {
  if (text.length > MAX_DESKTOP_FILE_BYTES) {
    return MASKED;
  }
  const result = RawDesktopEntry.safeParse(mainGroup(text));
  if (!result.success) {
    return MASKED;
  }
  const entry = result.data;
  const listed = !entry.NoDisplay || entry['X-GNOME-UsesNotifications'];
  if (entry.Type !== 'Application' || entry.Hidden || !listed) {
    return MASKED;
  }
  return { status: 'app', name: entry.Name.slice(0, LIMITS.nameLength).trim() };
}
