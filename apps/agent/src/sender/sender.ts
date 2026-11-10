import { IngestBatch } from '@yoman/shared/ingest';
import { LIMITS } from '@yoman/shared/limits';
import type { AgentLogger } from '../core/logger.js';
import type { Timers } from '../core/scheduler.js';
import { type AttemptResult, nextBatchLimit, planNext } from './domain/schedule.js';
import { type SendAttemptDeps, sendAttempt } from './send-attempt.js';

const systemTimers: Timers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface SenderOptions extends SendAttemptDeps {
  readonly logger: Pick<AgentLogger, 'debug' | 'info' | 'warn' | 'error'>;
  readonly timers?: Timers;
}

export type SenderState = 'idle' | 'running' | 'paused' | 'stopped';

/**
 * Sends the buffer to the gateway in the background (SPEC §4.3). It has the
 * scheduler's `pause` and `resume`, so the presence tracker can stop it while
 * the screen is locked like every other periodic task (SPEC §4.4).
 */
export interface Sender {
  /** Sends now, then keeps sending on the schedule. */
  start(): void;
  pause(): void;
  /** Sends now, as unlocking does for the collectors, then on the schedule. */
  resume(): void;
  /** Final. Waits for a send in flight, so an accepted batch is always acked. */
  stop(): Promise<void>;
  /** Resolves once no send is in flight. */
  whenIdle(): Promise<void>;
  readonly state: SenderState;
}

/**
 * Each attempt is armed only after the previous one settles, so sends never
 * overlap and a slow gateway never queues a burst of requests.
 */
export function createSender(options: SenderOptions): Sender {
  const timers = options.timers ?? systemTimers;
  const { logger } = options;
  // Fail at startup, not on every send, if the version cannot pass the contract.
  IngestBatch.shape.agentVersion.parse(options.agentVersion);

  let state: SenderState = 'idle';
  let handle: unknown;
  let inFlight: Promise<void> = Promise.resolve();
  // Bumped on every pause and stop, so an attempt that settles afterwards does not rearm.
  let generation = 0;
  let failures = 0;
  let limit: number = LIMITS.ingestSamples;

  async function attempt(): Promise<AttemptResult> {
    try {
      return await sendAttempt(options, limit);
    } catch (error: unknown) {
      // The buffer itself failed (disk full, permissions): retry on the backoff.
      const name = error instanceof Error ? error.name : typeof error;
      logger.error({ error: name }, 'send attempt failed');
      return { kind: 'failed' };
    }
  }

  function arm(delayMs: number): void {
    const armedIn = generation;
    handle = timers.setTimeout(() => {
      handle = undefined;
      inFlight = run(armedIn);
    }, delayMs);
  }

  async function run(armedIn: number): Promise<void> {
    const result = await attempt();
    const plan = planNext(failures, result);
    if (failures > 0 && plan.failures === 0) {
      logger.info({ failures }, 'gateway reachable again');
    }
    if (plan.failures > failures) {
      logger.warn({ failures: plan.failures, retryInMs: plan.delayMs }, 'backing off');
    }
    failures = plan.failures;
    limit = nextBatchLimit(limit, LIMITS.ingestSamples, result);
    if (state === 'running' && armedIn === generation) {
      arm(plan.delayMs);
    }
  }

  function disarm(): void {
    generation += 1;
    if (handle !== undefined) {
      timers.clearTimeout(handle);
      handle = undefined;
    }
  }

  function startNow(): void {
    state = 'running';
    // A send still in flight from before a pause finishes first, then the new one starts.
    const armedIn = generation;
    inFlight = inFlight.then(() => run(armedIn));
  }

  return {
    start(): void {
      if (state !== 'idle') {
        throw new Error(`cannot start a ${state} sender`);
      }
      startNow();
    },
    pause(): void {
      if (state === 'running') {
        disarm();
        state = 'paused';
      }
    },
    resume(): void {
      if (state === 'paused') {
        startNow();
      }
    },
    async stop(): Promise<void> {
      disarm();
      state = 'stopped';
      await inFlight;
    },
    whenIdle: () => inFlight,
    get state(): SenderState {
      return state;
    },
  };
}
