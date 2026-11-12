import type { AppId } from './common.js';

/**
 * Built-in system apps that are never muted (SPEC §4.2). The agent reports
 * notification IDs with dashes (`org-gnome-settings`), while desktop IDs use
 * dots (`org.gnome.Settings`), so every ID is normalized before it is matched
 * and both forms hit the same rule.
 */
const NEVER_MUTED_PREFIXES = ['gnome-', 'org-gnome-', 'org-freedesktop-', 'io-snapcraft-'] as const;

/**
 * Apps matched by name. Snap and Flatpak catalogs repeat the name
 * (`firmware-updater-firmware-updater`), so the doubled form counts too.
 * A longer name that merely starts with one of these is not matched.
 */
const NEVER_MUTED_NAMES: ReadonlySet<string> = new Set(
  [
    'update-manager',
    'yoman',
    'desktop-security-center',
    'firmware-updater',
    'snapd-desktop-integration',
    'snap-store',
    'nm-connection-editor',
    'im-config',
  ].flatMap((name) => [name, `${name}-${name}`]),
);

/** Lowercase, with dots as dashes: the one form IDs are compared in. */
export function normalizeAppId(app: AppId): string {
  return app.toLowerCase().replaceAll('.', '-');
}

/**
 * True for the built-in system apps, whichever form the ID is written in.
 * It never says "mutable": callers still check the user's own system list.
 */
export function isBuiltInNeverMuted(app: AppId): boolean {
  const id = normalizeAppId(app);
  return NEVER_MUTED_NAMES.has(id) || NEVER_MUTED_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/** True when two IDs name the same app despite dots, dashes or case. */
export function isSameApp(a: AppId, b: AppId): boolean {
  return normalizeAppId(a) === normalizeAppId(b);
}
