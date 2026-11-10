import { AppId } from '@yoman/shared/common';
import { LIMITS } from '@yoman/shared/limits';

/** Anything an app ID may not contain: spaces, slashes, quotes, non-ASCII. */
const DISALLOWED_RUN = /[^a-zA-Z0-9._-]+/g;
const EDGE_DASHES = /^-+|-+$/g;

/**
 * Turns a raw `wm_class` into an app ID. Disallowed runs become one `-`
 * (`Microsoft Teams` → `Microsoft-Teams`); case is kept, since the sessions
 * service matches it case-insensitively. Returns `undefined` when nothing
 * usable is left.
 */
export function toAppId(wmClass: string): AppId | undefined {
  const normalized = wmClass
    .replace(DISALLOWED_RUN, '-')
    .replace(EDGE_DASHES, '')
    .slice(0, LIMITS.appIdLength);
  const result = AppId.safeParse(normalized);
  return result.success ? result.data : undefined;
}
