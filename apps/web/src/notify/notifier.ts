import type { i18n } from 'i18next';
import { z } from 'zod';

import { ApiError } from '../api/client.js';

export type ToastVariant = 'success' | 'info' | 'warning' | 'error';

/** What the toast host provides: show a finished message. `key` is the variant and text, so only identical toasts collapse. */
export type Enqueue = (message: string, variant: ToastVariant, key: string) => void;

/**
 * The one way the app shows a toast. Pages and the query caches only name an
 * i18n key (or hand over an error); wording, language and the request id live here.
 */
export interface Notifier {
  readonly success: (messageKey: string) => void;
  readonly info: (messageKey: string) => void;
  readonly warning: (messageKey: string) => void;
  /** An error toast: a generic message, plus the gateway's request id when the error has one. */
  readonly error: (error: unknown) => void;
  /** Called by the toast host once it can show toasts. Toasts raised earlier are shown then. */
  readonly connect: (enqueue: Enqueue) => () => void;
}

/** i18n keys of the shared toast texts, in the `common` namespace. */
export const NOTIFY_KEYS = {
  error: 'common:notify.error',
  errorWithId: 'common:notify.errorWithId',
  degraded: 'common:notify.degraded',
} as const;

/** How many toasts raised before the toast host connects are kept; later ones are dropped. */
const MAX_BUFFERED = 20;

/** A response that lists unavailable services (`degraded`, SPEC §5). */
const DegradedResponse = z.looseObject({ degraded: z.array(z.string()).min(1) });

/** True when a gateway response says some services were unavailable. */
export function isDegraded(data: unknown): boolean {
  return DegradedResponse.safeParse(data).success;
}

/**
 * Creates the app's notifier. Toasts are translated with `i18n` when they are
 * raised. Until the toast host calls `connect`, up to `MAX_BUFFERED` toasts are
 * held and shown on connect, so a failure during startup is not lost.
 */
export function createNotifier(i18n: Pick<i18n, 't'>): Notifier {
  let enqueue: Enqueue | undefined;
  const buffered: Array<() => void> = [];

  const show = (
    messageKey: string,
    variant: ToastVariant,
    params?: Record<string, string>,
  ): void => {
    const run = (): void => {
      const message = params === undefined ? i18n.t(messageKey) : i18n.t(messageKey, params);
      enqueue?.(message, variant, `${variant}:${message}`);
    };
    if (enqueue === undefined) {
      if (buffered.length < MAX_BUFFERED) {
        buffered.push(run);
      }
      return;
    }
    run();
  };

  return {
    success: (messageKey): void => show(messageKey, 'success'),
    info: (messageKey): void => show(messageKey, 'info'),
    warning: (messageKey): void => show(messageKey, 'warning'),
    error: (error): void => {
      const requestId = error instanceof ApiError ? error.requestId : undefined;
      if (requestId === undefined) {
        show(NOTIFY_KEYS.error, 'error');
        return;
      }
      show(NOTIFY_KEYS.errorWithId, 'error', { requestId });
    },
    connect: (next): (() => void) => {
      enqueue = next;
      for (const run of buffered.splice(0)) {
        run();
      }
      return (): void => {
        if (enqueue === next) {
          enqueue = undefined;
        }
      };
    },
  };
}
