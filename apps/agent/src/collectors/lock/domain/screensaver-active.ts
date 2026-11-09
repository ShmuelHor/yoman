import { z } from 'zod';

/** Both `GetActive` and the `ActiveChanged` signal carry one boolean (`b`). */
const ScreenSaverActive = z.tuple([z.boolean()]);

/** Whether the screen is locked, or `undefined` for a payload of the wrong shape. */
export function parseScreenSaverActive(body: readonly unknown[]): boolean | undefined {
  const result = ScreenSaverActive.safeParse(body);
  return result.success ? result.data[0] : undefined;
}
