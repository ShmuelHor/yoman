import { z } from 'zod';

/** The dconf key GNOME Shell adds an app to the first time it notifies. */
export const APPLICATION_CHILDREN_KEY = '/org/gnome/desktop/notifications/application-children';

/** dconf paths are short; a longer one, or a huge change list, is not trusted. */
const MAX_PATH_LENGTH = 1_024;
const MAX_CHANGES = 1_000;

/** `ca.desrt.dconf.Writer.Notify` carries `(prefix s, changes as, tag s)`. */
const DconfNotify = z.tuple([
  z.string().max(MAX_PATH_LENGTH),
  z.array(z.string().max(MAX_PATH_LENGTH)).max(MAX_CHANGES),
  z.string().max(MAX_PATH_LENGTH),
]);

/**
 * Whether a dconf change signal may have changed `application-children`:
 * the key itself, or a directory above it that was reset. Returns
 * `undefined` for a payload of the wrong shape.
 */
export function touchesApplicationChildren(body: readonly unknown[]): boolean | undefined {
  const result = DconfNotify.safeParse(body);
  if (!result.success) {
    return undefined;
  }
  const [prefix, changes] = result.data;
  // One changed key arrives as its full path with a single empty change.
  const paths = changes.length === 0 ? [prefix] : changes.map((change) => prefix + change);
  return paths.some((path) =>
    path.endsWith('/')
      ? APPLICATION_CHILDREN_KEY.startsWith(path)
      : path === APPLICATION_CHILDREN_KEY,
  );
}
