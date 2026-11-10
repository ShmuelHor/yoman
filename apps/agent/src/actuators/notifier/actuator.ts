import type { Actuator, PluginContext } from '../../core/plugin.js';
import { SessionBusError, type Unsubscribe } from '../../core/session-bus.js';
import { DEFAULT_LANGUAGE } from '../../i18n/catalogs.js';
import {
  DEFAULT_ACTION,
  OPEN_DASHBOARD_ACTION,
  sendNotification,
  subscribeActionInvoked,
  subscribeNotificationClosed,
} from './adapters/notifications.js';
import { openUri } from './adapters/open-uri.js';
import { renderNotification } from './domain/notification.js';
import { NotifyRequest } from './domain/notify-request.js';
import { RecentIds } from './domain/recent-ids.js';
import { parseActionInvoked, parseNotificationClosed, parseNotifyReply } from './domain/signals.js';

export const NOTIFIER_NAME = 'notifier';

/** The web is published on loopback only (SPEC §3, SECURITY network rules). */
export const DASHBOARD_URL = 'http://127.0.0.1:4710/';

/** More than a screen of notifications; older ids can no longer be clicked in practice. */
const TRACKED_NOTIFICATIONS = 32;

const DASHBOARD_ACTIONS: ReadonlySet<string> = new Set([DEFAULT_ACTION, OPEN_DASHBOARD_ACTION]);

/**
 * Shows each delivered alert as a desktop notification (SPEC §4.2), and
 * opens the dashboard when the user clicks one. The sender calls it with
 * each alert in `IngestResult.deliver`; it does not decide what to show.
 * `run` rejects with a `SessionBusError` when no notification server answers,
 * so the caller decides whether to retry.
 */
export function createNotifier(): Actuator<NotifyRequest> {
  const shown = new RecentIds(TRACKED_NOTIFICATIONS);
  let unsubscribes: Unsubscribe[] = [];

  function onAction(context: PluginContext, body: readonly unknown[]): void {
    const invoked = parseActionInvoked(body);
    // Every app's notification actions reach us; only our own are ours to handle.
    if (invoked === undefined || !shown.has(invoked.id) || !DASHBOARD_ACTIONS.has(invoked.action)) {
      return;
    }
    shown.delete(invoked.id);
    openUri(context.sessionBus, DASHBOARD_URL).catch((error: unknown) => {
      context.logger.warn(
        {
          actuator: NOTIFIER_NAME,
          code: error instanceof SessionBusError ? error.code : undefined,
        },
        'could not open the dashboard',
      );
    });
  }

  function onClosed(body: readonly unknown[]): void {
    const id = parseNotificationClosed(body);
    if (id !== undefined) {
      shown.delete(id);
    }
  }

  return {
    kind: 'actuator',
    name: NOTIFIER_NAME,
    input: NotifyRequest,
    async start(context): Promise<void> {
      try {
        // One at a time, so a failed second subscription still leaves the first to stop.
        unsubscribes.push(
          await subscribeActionInvoked(context.sessionBus, (body) => {
            onAction(context, body);
          }),
        );
        unsubscribes.push(await subscribeNotificationClosed(context.sessionBus, onClosed));
      } catch (error: unknown) {
        if (!(error instanceof SessionBusError)) {
          throw error;
        }
        context.logger.warn(
          { actuator: NOTIFIER_NAME, code: error.code, reason: error.message },
          'notification clicks will not open the dashboard',
        );
      }
    },
    async run({ alert, language }, context): Promise<void> {
      const { notification, missingParams } = renderNotification({
        alert,
        language: language ?? DEFAULT_LANGUAGE,
      });
      if (missingParams.length > 0) {
        context.logger.warn(
          { actuator: NOTIFIER_NAME, alertType: alert.type, missingParams },
          'alert is missing message params',
        );
      }
      const id = parseNotifyReply(await sendNotification(context.sessionBus, notification));
      if (id === undefined) {
        // The notification was most likely shown; only its clicks cannot be matched.
        context.logger.warn(
          { actuator: NOTIFIER_NAME, alertType: alert.type },
          'notification server sent an unexpected reply',
        );
        return;
      }
      shown.add(id);
    },
    async stop(): Promise<void> {
      const active = unsubscribes;
      unsubscribes = [];
      await Promise.all(active.map((unsubscribe) => unsubscribe()));
    },
  };
}
