import type { Collector, CollectorContext } from '../../core/plugin.js';
import { SessionBusError, type Unsubscribe } from '../../core/session-bus.js';
import { requestActive, subscribeActiveChanged } from './adapters/screensaver.js';
import { parseScreenSaverActive } from './domain/screensaver-active.js';

export const LOCK_COLLECTOR_NAME = 'lock';

/**
 * Follows the GNOME screen lock (SPEC §4.1) and reports it as presence, which
 * pauses every polling collector while locked. Event-driven: it costs nothing
 * between lock changes. Without GNOME Shell it warns and the agent runs on,
 * unpaused.
 */
export function createLockCollector(): Collector {
  let unsubscribe: Unsubscribe | undefined;

  function report(context: CollectorContext, body: readonly unknown[]): void {
    const locked = parseScreenSaverActive(body);
    if (locked === undefined) {
      context.logger.warn(
        { collector: LOCK_COLLECTOR_NAME },
        'screen saver sent an unexpected payload, ignored',
      );
      return;
    }
    // Someone just unlocked the screen, so they are not idle, whatever the last poll said.
    context.reportPresence(locked ? { locked } : { locked, idleMs: 0 });
  }

  function warnUntracked(context: CollectorContext, error: SessionBusError): void {
    context.logger.warn(
      { collector: LOCK_COLLECTOR_NAME, code: error.code, reason: error.message },
      'screen lock is not tracked, is this GNOME?',
    );
  }

  return {
    kind: 'collector',
    name: LOCK_COLLECTOR_NAME,
    async start(context): Promise<void> {
      try {
        // Subscribe before asking, so a lock between the two is not missed.
        unsubscribe = await subscribeActiveChanged(context.sessionBus, (body) => {
          report(context, body);
        });
        report(context, await requestActive(context.sessionBus));
      } catch (error: unknown) {
        if (!(error instanceof SessionBusError)) {
          throw error;
        }
        warnUntracked(context, error);
      }
    },
    async stop(): Promise<void> {
      const active = unsubscribe;
      unsubscribe = undefined;
      await active?.();
    },
  };
}
