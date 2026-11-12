import { type KnownApp, KnownAppsReport, KnownAppsResult } from '@yoman/shared/focus';
import { LIMITS } from '@yoman/shared/limits';
import type { AgentLogger } from '../core/logger.js';
import type { KnownAppsClient } from './adapters/known-apps-client.js';
import { BACKOFF_FACTOR, MAX_BACKOFF_MS } from './domain/schedule.js';

/** Short, so a freshly installed app shows up soon, but long enough not to hammer a gateway that is down. */
export const FIRST_RETRY_MS = 10_000;
const HTTP_OK = 200;
const HTTP_REQUEST_TIMEOUT = 408;
const HTTP_TOO_MANY_REQUESTS = 429;
const FIRST_SERVER_ERROR = 500;

export interface KnownAppsReporterOptions {
  readonly client: KnownAppsClient;
  readonly logger: Pick<AgentLogger, 'info' | 'warn'>;
}

/**
 * Reports the app catalog to the gateway for focus mode (SPEC §4.3). Only the
 * latest catalog matters, so a newer one replaces one still waiting to be
 * sent. Event-driven: it sends when the catalog changes and retries with a
 * backoff while the gateway is unreachable. It has the scheduler's `pause` and
 * `resume`, so nothing is sent while the screen is locked (SPEC §4.4).
 */
export interface KnownAppsReporter {
  report(apps: readonly KnownApp[]): void;
  pause(): void;
  resume(): void;
  /** Final. Waits for a request in flight. */
  stop(): Promise<void>;
}

/** A failure worth retrying: the gateway was unreachable, slow, busy or broken. */
function isTransient(status: number): boolean {
  return (
    status === HTTP_REQUEST_TIMEOUT ||
    status === HTTP_TOO_MANY_REQUESTS ||
    status >= FIRST_SERVER_ERROR
  );
}

export function createKnownAppsReporter(options: KnownAppsReporterOptions): KnownAppsReporter {
  const { client, logger } = options;
  let pending: KnownAppsReport | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> = Promise.resolve();
  let sending = false;
  let paused = false;
  let stopped = false;
  let failures = 0;

  function disarm(): void {
    clearTimeout(timer);
    timer = undefined;
  }

  function retryLater(): void {
    const delay = Math.min(FIRST_RETRY_MS * BACKOFF_FACTOR ** failures, MAX_BACKOFF_MS);
    failures += 1;
    disarm();
    timer = setTimeout(sendNow, delay);
  }

  async function attempt(report: KnownAppsReport): Promise<void> {
    let status: number;
    let body: unknown;
    try {
      ({ status, body } = await client.post(report));
    } catch (error: unknown) {
      logger.warn(
        { error: error instanceof Error ? error.name : typeof error },
        'known apps could not be sent',
      );
      retryLater();
      return;
    }
    if (status === HTTP_OK && KnownAppsResult.safeParse(body).success) {
      failures = 0;
      // A newer catalog that arrived meanwhile stays pending and goes out next.
      if (pending === report) {
        pending = undefined;
      }
      logger.info({ apps: report.items.length }, 'known apps sent');
      return;
    }
    if (isTransient(status)) {
      logger.warn({ status }, 'known apps were not accepted, retrying');
      retryLater();
      return;
    }
    // The gateway refused the catalog itself: sending it again cannot help.
    logger.warn({ status }, 'known apps were refused and dropped');
    if (pending === report) {
      pending = undefined;
    }
  }

  function sendNow(): void {
    disarm();
    const report = pending;
    if (report === undefined || paused || stopped || sending) {
      return;
    }
    sending = true;
    inFlight = attempt(report).finally(() => {
      sending = false;
      if (pending !== undefined && timer === undefined) {
        sendNow();
      }
    });
  }

  return {
    report(apps): void {
      if (stopped) {
        return;
      }
      if (apps.length > LIMITS.listSize) {
        logger.warn({ apps: apps.length, kept: LIMITS.listSize }, 'known apps cut to the limit');
      }
      pending = KnownAppsReport.parse({ items: apps.slice(0, LIMITS.listSize) });
      failures = 0;
      sendNow();
    },
    pause(): void {
      paused = true;
      disarm();
    },
    resume(): void {
      paused = false;
      sendNow();
    },
    async stop(): Promise<void> {
      stopped = true;
      disarm();
      await inFlight;
    },
  };
}
