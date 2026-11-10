import type { AlertLevel, AlertParams } from '@yoman/shared/alerts';
import { notificationMessages } from '@yoman/shared/notifications';
import type { Language } from '@yoman/shared/settings';
import { translate } from '../../../i18n/catalogs.js';
import { interpolate } from '../../../i18n/translation-tree.js';
import { escapeMarkup, plainText } from './markup.js';
import type { NotifyRequest } from './notify-request.js';

/** The freedesktop urgency hint: 0 low, 1 normal, 2 critical. */
export type Urgency = 0 | 1 | 2;

const NORMAL_URGENCY: Urgency = 1;
/** Critical notifications get through GNOME's "Do Not Disturb" (SPEC §4.2). */
const CRITICAL_URGENCY: Urgency = 2;

/** One decimal is enough for every alert value (percent, °C, MB per hour). */
const MAX_FRACTION_DIGITS = 1;

const APP_NAME_KEY = 'notifications.appName';
const OPEN_DASHBOARD_KEY = 'notifications.action.openDashboard';

/** A notification ready for `org.freedesktop.Notifications.Notify`. */
export interface Notification {
  readonly appName: string;
  /** Plain text: notification servers never read markup in the summary. */
  readonly summary: string;
  /** Escaped for the body-markup subset. */
  readonly body: string;
  readonly urgency: Urgency;
  readonly openDashboardLabel: string;
}

export interface RenderedNotification {
  readonly notification: Notification;
  /** Params the message needs but the alert did not carry. Names only, never values. */
  readonly missingParams: readonly string[];
}

export type Translate = (key: string, language: Language) => string;

/** Critical is the only level that may interrupt; important and normal are both 1 (SPEC §4.2). */
export function urgencyFor(level: AlertLevel): Urgency {
  return level === 'critical' ? CRITICAL_URGENCY : NORMAL_URGENCY;
}

function formatParams(params: AlertParams, language: Language): Record<string, string> {
  const numbers = new Intl.NumberFormat(language, { maximumFractionDigits: MAX_FRACTION_DIGITS });
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [
      name,
      typeof value === 'number' ? numbers.format(value) : plainText(value),
    ]),
  );
}

/** Turns a delivered alert into the translated notification the user sees. */
export function renderNotification(
  { alert, language }: { readonly alert: NotifyRequest['alert']; readonly language: Language },
  translateKey: Translate = translate,
): RenderedNotification {
  const messages = notificationMessages[alert.type];
  const body = interpolate(
    translateKey(messages.body, language),
    formatParams(alert.params, language),
  );
  return {
    notification: {
      appName: translateKey(APP_NAME_KEY, language),
      summary: translateKey(messages.title, language),
      body: escapeMarkup(body.text),
      urgency: urgencyFor(alert.level),
      openDashboardLabel: translateKey(OPEN_DASHBOARD_KEY, language),
    },
    missingParams: body.missing,
  };
}
