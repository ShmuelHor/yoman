import { LIMITS } from '@yoman/shared/limits';
import { z } from 'zod';

/** `GetIdletime` replies with one `t` (uint64) of milliseconds, which dbus-next decodes as a bigint. */
const IdletimeReply = z.tuple([z.bigint().nonnegative()]);

/**
 * Parses a `GetIdletime` reply into milliseconds, capped at the contract's
 * limit: after a day away, the exact time no longer matters. Returns
 * `undefined` for a reply of the wrong shape.
 */
export function parseIdletime(body: readonly unknown[]): number | undefined {
  const result = IdletimeReply.safeParse(body);
  if (!result.success) {
    return undefined;
  }
  const [idleMs] = result.data;
  return Math.min(Number(idleMs), LIMITS.idleMs);
}
