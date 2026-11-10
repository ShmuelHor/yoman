import { z } from 'zod';
import { NotificationId } from './notification-id.js';

/** Far more apps than a desktop has ever notified from; the output is bounded before parsing. */
export const MAX_GSETTINGS_OUTPUT_LENGTH = 262_144;
export const MAX_APPLICATION_CHILDREN = 2_000;

const EMPTY_ARRAY = /^(@as\s+)?\[\]$/;
const ARRAY = /^\[(.*)\]$/s;
const QUOTED = /^'(.*)'$/s;
const SEPARATOR = ', ';

const Output = z.string().max(MAX_GSETTINGS_OUTPUT_LENGTH);

/**
 * Parses `gsettings get org.gnome.desktop.notifications application-children`,
 * a GVariant `as` such as `['firefox', 'org-gnome-nautilus']`. dconf is
 * writable by any app the user runs, so the output is untrusted: an item that
 * is not a valid notification ID is skipped, and anything else returns `undefined`.
 */
export function parseApplicationChildren(stdout: unknown): NotificationId[] | undefined {
  const output = Output.safeParse(stdout);
  if (!output.success) {
    return undefined;
  }
  const text = output.data.trim();
  if (EMPTY_ARRAY.test(text)) {
    return [];
  }
  const inner = ARRAY.exec(text)?.[1];
  if (inner === undefined) {
    return undefined;
  }
  const ids = new Set<NotificationId>();
  for (const item of inner.split(SEPARATOR).slice(0, MAX_APPLICATION_CHILDREN)) {
    const id = NotificationId.safeParse(QUOTED.exec(item)?.[1]);
    if (id.success) {
      ids.add(id.data);
    }
  }
  return [...ids];
}
