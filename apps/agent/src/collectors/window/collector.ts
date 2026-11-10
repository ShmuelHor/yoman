import { WindowSample } from '@yoman/shared/ingest';
import type { Collector, CollectorContext } from '../../core/plugin.js';
import { SessionBusError } from '../../core/session-bus.js';
import { requestWindowList } from './adapters/window-calls.js';
import { type FocusedWindow, parseWindowList } from './domain/focused-window.js';

export const WINDOW_COLLECTOR_NAME = 'window';
/** SPEC §4.1: a 5 s resolution is enough for time tracking. */
export const WINDOW_INTERVAL_MS = 5_000;

export interface WindowCollectorOptions {
  readonly now?: () => Date;
}

type Problem = 'unavailable' | 'malformed';

/**
 * Samples the focused window with the latest presence (SPEC §4.1). Without
 * the Window Calls extension it warns once and keeps trying, so enabling the
 * extension later is picked up without a restart.
 *
 * The title is never sent: the agent has no privacy setting to say it may be
 * stored yet, so it fails closed (SPEC §7, SECURITY ST17).
 */
export function createWindowCollector(options: WindowCollectorOptions = {}): Collector {
  const now = options.now ?? ((): Date => new Date());
  // Each problem is reported once per outage, not every 5 s.
  let reported: Problem | undefined;

  function warnOnce(context: CollectorContext, problem: Problem, fields: object): void {
    if (reported === problem) {
      return;
    }
    reported = problem;
    const message =
      problem === 'unavailable'
        ? 'focused window is unavailable, is the Window Calls extension enabled?'
        : 'Window Calls replied with an unexpected payload';
    context.logger.warn({ collector: WINDOW_COLLECTOR_NAME, ...fields }, message);
  }

  async function focusedWindow(context: CollectorContext): Promise<FocusedWindow | undefined> {
    let body: readonly unknown[];
    try {
      body = await requestWindowList(context.sessionBus);
    } catch (error: unknown) {
      if (!(error instanceof SessionBusError)) {
        throw error;
      }
      warnOnce(context, 'unavailable', { code: error.code, reason: error.message });
      return undefined;
    }
    const result = parseWindowList(body);
    if (result.status === 'malformed') {
      warnOnce(context, 'malformed', {});
      return undefined;
    }
    reported = undefined;
    return result.status === 'focused' ? result.window : undefined;
  }

  return {
    kind: 'collector',
    name: WINDOW_COLLECTOR_NAME,
    intervalMs: WINDOW_INTERVAL_MS,
    async collect(context): Promise<readonly WindowSample[]> {
      const window = await focusedWindow(context);
      if (window === undefined) {
        return [];
      }
      // The parts are validated already; a sample that misses the contract is a bug.
      return [
        WindowSample.parse({
          kind: 'window',
          ts: now().toISOString(),
          wmClass: window.wmClass,
          pid: window.pid,
          idleMs: context.presence.idleMs,
          locked: context.presence.locked,
        }),
      ];
    },
  };
}
