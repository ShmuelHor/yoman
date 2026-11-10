import { Variant } from 'dbus-next';
import type {
  MethodCall,
  SessionBus,
  SignalHandler,
  SignalMatch,
  Unsubscribe,
} from '../../../core/session-bus.js';
import type { Notification } from '../domain/notification.js';

const NOTIFICATIONS = {
  path: '/org/freedesktop/Notifications',
  interface: 'org.freedesktop.Notifications',
} as const;
const NOTIFICATIONS_NAME = 'org.freedesktop.Notifications';

/** Clicking the notification itself, by the freedesktop spec. */
export const DEFAULT_ACTION = 'default';
export const OPEN_DASHBOARD_ACTION = 'open-dashboard';

/** `Notify(app_name, replaces_id, app_icon, summary, body, actions, hints, expire_timeout)`. */
const NOTIFY_SIGNATURE = 'susssasa{sv}i';
/** A new notification, not a replacement. */
const NEW_NOTIFICATION = 0;
const NO_ICON = '';
/** Let the server decide; GNOME keeps critical ones until they are dismissed. */
const SERVER_DEFAULT_TIMEOUT = -1;

const ACTION_INVOKED: SignalMatch = {
  ...NOTIFICATIONS,
  sender: NOTIFICATIONS_NAME,
  member: 'ActionInvoked',
};

const NOTIFICATION_CLOSED: SignalMatch = {
  ...NOTIFICATIONS,
  sender: NOTIFICATIONS_NAME,
  member: 'NotificationClosed',
};

function notifyCall(notification: Notification): MethodCall {
  return {
    ...NOTIFICATIONS,
    destination: NOTIFICATIONS_NAME,
    member: 'Notify',
    signature: NOTIFY_SIGNATURE,
    body: [
      notification.appName,
      NEW_NOTIFICATION,
      NO_ICON,
      notification.summary,
      notification.body,
      // Both the button and a click on the notification open the dashboard.
      [
        DEFAULT_ACTION,
        notification.openDashboardLabel,
        OPEN_DASHBOARD_ACTION,
        notification.openDashboardLabel,
      ],
      { urgency: new Variant('y', notification.urgency) },
      SERVER_DEFAULT_TIMEOUT,
    ],
  };
}

/** Shows `notification`. Resolves with the unparsed reply, which carries the notification id. */
export function sendNotification(
  bus: SessionBus,
  notification: Notification,
): Promise<readonly unknown[]> {
  return bus.call(notifyCall(notification));
}

/** Calls `handler` with each unparsed `ActionInvoked` body from the notification server. */
export function subscribeActionInvoked(
  bus: SessionBus,
  handler: SignalHandler,
): Promise<Unsubscribe> {
  return bus.subscribe(ACTION_INVOKED, handler);
}

/** Calls `handler` with each unparsed `NotificationClosed` body from the notification server. */
export function subscribeNotificationClosed(
  bus: SessionBus,
  handler: SignalHandler,
): Promise<Unsubscribe> {
  return bus.subscribe(NOTIFICATION_CLOSED, handler);
}
