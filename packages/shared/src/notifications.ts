import type { AlertType } from './alerts.js';

export interface NotificationMessage {
  /** i18n key of the notification's summary line. */
  readonly title: `notifications.${string}.title`;
  /** i18n key of the body text. */
  readonly body: `notifications.${string}.body`;
  /** The `Alert.params` the messages interpolate. Every alert of this type sends them. */
  readonly params: readonly string[];
}

/**
 * The i18n keys for every alert's notification. The `he` and `en` strings live in
 * the web and agent translation files; this map is the contract both sides share.
 */
export const notificationMessages = {
  'battery-low': {
    title: 'notifications.batteryLow.title',
    body: 'notifications.batteryLow.body',
    params: ['percent'],
  },
  'battery-critical': {
    title: 'notifications.batteryCritical.title',
    body: 'notifications.batteryCritical.body',
    params: ['percent'],
  },
  'battery-plugged-full': {
    title: 'notifications.batteryPluggedFull.title',
    body: 'notifications.batteryPluggedFull.body',
    params: ['hours'],
  },
  'pressure-incident': {
    title: 'notifications.pressureIncident.title',
    body: 'notifications.pressureIncident.body',
    params: ['resource', 'peak', 'culprit'],
  },
  'memory-critical': {
    title: 'notifications.memoryCritical.title',
    body: 'notifications.memoryCritical.body',
    params: ['availablePct'],
  },
  thermal: {
    title: 'notifications.thermal.title',
    body: 'notifications.thermal.body',
    params: ['celsius'],
  },
  'memory-leak': {
    title: 'notifications.memoryLeak.title',
    body: 'notifications.memoryLeak.body',
    params: ['comm', 'mbPerHour'],
  },
  'goal-breach': {
    title: 'notifications.goalBreach.title',
    body: 'notifications.goalBreach.body',
    params: ['target', 'minutesUsed', 'targetMinutes'],
  },
} as const satisfies Record<AlertType, NotificationMessage>;

/** Every notification i18n key, for checking that a translation file is complete. */
export const notificationKeys: readonly string[] = Object.values(notificationMessages).flatMap(
  (m) => [m.title, m.body],
);
