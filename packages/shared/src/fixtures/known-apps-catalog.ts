/**
 * A real catalog as the agent reports it: notification IDs with dashes, snap
 * apps with a doubled name. Every app but Telegram is a system app.
 */
export const SYSTEM_APP_IDS = [
  'org-gnome-settings',
  'org-gnome-nautilus',
  'org-gnome-evolution-alarm-notify',
  'org-gnome-software',
  'org-freedesktop-impl-portal-desktop-gnome',
  'gnome-control-center',
  'update-manager',
  'desktop-security-center-desktop-security-center',
  'firmware-updater-firmware-updater',
  'snapd-desktop-integration-snapd-desktop-integration',
  'snap-store-snap-store',
  'io-snapcraft-snapstore',
  'nm-connection-editor',
  'im-config',
  'yoman',
] as const;

export const USER_APP_IDS = ['telegram-desktop-telegram-desktop', 'slack'] as const;
