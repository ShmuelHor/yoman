import { join } from 'node:path';
import type { Actuator, PluginContext } from '../../core/plugin.js';
import { type RunFile, readShowBanners, writeShowBanners } from './adapters/gsettings.js';
import { loadMuteState, saveMuteState } from './adapters/state-file.js';
import { checkMutable } from './domain/mutable-app.js';
import { MuteRequest } from './domain/mute-request.js';
import { EMPTY_MUTE_STATE, isExpired, type MuteState } from './domain/mute-state.js';

export const MUTER_NAME = 'muter';
export const MUTE_STATE_FILE = 'mute-state.json';

/** `setTimeout` runs at once for delays above 2^31-1 ms (about 24.8 days). */
const MAX_TIMER_MS = 2_147_483_647;

export interface MuterOptions {
  /** `~/.local/state/yoman`; the state file lives directly in it. */
  readonly stateDir: string;
  readonly run: RunFile;
  readonly now?: () => Date;
}

/**
 * Mutes apps' notification banners during focus (SPEC §4.2) and always puts
 * them back. Before it changes an app it saves the app's original value, so
 * a crash or `kill -9` mid-focus is undone on the next start, and it restores
 * by itself once the session's `endsAt` has passed.
 */
export function createMuter(options: MuterOptions): Actuator<MuteRequest> {
  const statePath = join(options.stateDir, MUTE_STATE_FILE);
  const now = options.now ?? ((): Date => new Date());
  let state: MuteState = EMPTY_MUTE_STATE;
  let timer: NodeJS.Timeout | undefined;
  let started: PluginContext | undefined;
  /** Runs one change at a time, so the timer and a command never interleave. */
  let queue: Promise<void> = Promise.resolve();

  function serialized(work: () => Promise<void>): Promise<void> {
    const result = queue.then(work);
    queue = result.catch(() => undefined);
    return result;
  }

  async function restore(appIds: readonly string[], context: PluginContext): Promise<void> {
    for (const appId of appIds) {
      const original = state.originals[appId];
      if (original === undefined) {
        continue;
      }
      try {
        await writeShowBanners(options.run, appId, original);
      } catch (error: unknown) {
        // Kept in the state file, so the next start or expiry tries again.
        context.logger.warn(
          { actuator: MUTER_NAME, appId, reason: errorName(error) },
          'could not restore an app',
        );
        continue;
      }
      const { [appId]: _restored, ...rest } = state.originals;
      state = { ...state, originals: rest };
      await saveMuteState(statePath, state);
    }
  }

  async function restoreAll(context: PluginContext): Promise<void> {
    clearTimer();
    await restore(Object.keys(state.originals), context);
    // Nothing is left to protect, so the finished session's end time goes too.
    if (Object.keys(state.originals).length === 0 && state.endsAt !== null) {
      state = EMPTY_MUTE_STATE;
      await saveMuteState(statePath, state);
    }
  }

  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function armExpiry(context: PluginContext): void {
    clearTimer();
    if (state.endsAt === null) {
      return;
    }
    const delay = Math.min(
      Math.max(new Date(state.endsAt).getTime() - now().getTime() + 1, 0),
      MAX_TIMER_MS,
    );
    timer = setTimeout(() => {
      timer = undefined;
      serialized(async () => {
        if (state.endsAt !== null && new Date(state.endsAt).getTime() >= now().getTime()) {
          armExpiry(context);
          return;
        }
        await restoreAll(context);
      }).catch((error: unknown) => {
        context.logger.error(
          { actuator: MUTER_NAME, reason: errorName(error) },
          'could not restore after focus ended',
        );
      });
    }, delay);
    timer.unref();
  }

  async function mute(request: MuteRequest, context: PluginContext): Promise<void> {
    for (const appId of request.mute) {
      const check = checkMutable(appId, request.systemApps);
      if (!check.mutable) {
        context.logger.info({ actuator: MUTER_NAME, appId, reason: check.reason }, 'app not muted');
        continue;
      }
      try {
        if (state.originals[appId] === undefined) {
          const original = await readShowBanners(options.run, appId);
          // Saved before the change: a crash right after still finds it.
          state = { ...state, originals: { ...state.originals, [appId]: original } };
          await saveMuteState(statePath, state);
        }
        await writeShowBanners(options.run, appId, 'false');
      } catch (error: unknown) {
        context.logger.warn(
          { actuator: MUTER_NAME, appId, reason: errorName(error) },
          'could not mute an app',
        );
      }
    }
  }

  async function handle(request: MuteRequest, context: PluginContext): Promise<void> {
    if (request.endsAt !== undefined) {
      state = { ...state, endsAt: request.endsAt };
    }
    await restore(request.restore, context);
    if (isExpired(state, now())) {
      await restoreAll(context);
      return;
    }
    await mute(request, context);
    if (Object.keys(state.originals).length > 0) {
      await saveMuteState(statePath, state);
      armExpiry(context);
    } else {
      clearTimer();
    }
  }

  return {
    kind: 'actuator',
    name: MUTER_NAME,
    input: MuteRequest,
    start(context): Promise<void> {
      started = context;
      return serialized(async () => {
        const loaded = await loadMuteState(statePath);
        if (loaded.corrupt) {
          context.logger.warn({ actuator: MUTER_NAME }, 'mute state was unreadable and was reset');
        }
        state = loaded.state;
        // Anything still saved here survived a crash: nobody is in focus yet.
        await restoreAll(context);
      });
    },
    run(request, context): Promise<void> {
      return serialized(() => handle(request, context));
    },
    stop(): Promise<void> {
      clearTimer();
      const context = started;
      // A clean shutdown leaves nothing muted; a crash is covered by `start`.
      return context === undefined ? queue : serialized(() => restoreAll(context));
    },
  };
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}
