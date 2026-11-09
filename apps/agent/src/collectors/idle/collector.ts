import type { Collector, CollectorContext } from '../../core/plugin.js';
import { SessionBusError } from '../../core/session-bus.js';
import { requestIdletime } from './adapters/idle-monitor.js';
import { parseIdletime } from './domain/idle-time.js';

export const IDLE_COLLECTOR_NAME = 'idle';
/** SPEC §4.1: the same cadence as the window collector that reads the result. */
export const IDLE_INTERVAL_MS = 5_000;

type Problem = 'unavailable' | 'malformed';

/**
 * Polls Mutter's idle time and reports it as presence; it buffers no samples
 * of its own, since the window collector carries `idleMs` (SPEC §4.1). Without
 * Mutter (another desktop, or no session bus) it warns once and keeps trying,
 * so a restarted GNOME Shell is picked up again.
 */
export function createIdleCollector(): Collector {
  // Each problem is reported once per outage, not every 5 s.
  let reported: Problem | undefined;

  function warnOnce(context: CollectorContext, problem: Problem, fields: object): void {
    if (reported === problem) {
      return;
    }
    reported = problem;
    const message =
      problem === 'unavailable'
        ? 'idle time is unavailable, is this GNOME?'
        : 'idle monitor replied with an unexpected payload';
    context.logger.warn({ collector: IDLE_COLLECTOR_NAME, ...fields }, message);
  }

  async function read(context: CollectorContext): Promise<void> {
    let body: readonly unknown[];
    try {
      body = await requestIdletime(context.sessionBus);
    } catch (error: unknown) {
      if (!(error instanceof SessionBusError)) {
        throw error;
      }
      warnOnce(context, 'unavailable', { code: error.code, reason: error.message });
      return;
    }
    const idleMs = parseIdletime(body);
    if (idleMs === undefined) {
      warnOnce(context, 'malformed', {});
      return;
    }
    reported = undefined;
    context.reportPresence({ idleMs });
  }

  return {
    kind: 'collector',
    name: IDLE_COLLECTOR_NAME,
    intervalMs: IDLE_INTERVAL_MS,
    async collect(context): Promise<readonly []> {
      await read(context);
      return [];
    },
  };
}
