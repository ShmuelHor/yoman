import { setImmediate } from 'node:timers/promises';
import { IngestBatch } from '@yoman/shared/ingest';
import { LIMITS } from '@yoman/shared/limits';
import pRetry from 'p-retry';
import type { AgentLogger } from '../core/logger.js';
import {
  type AnsweredAttempt,
  BACKOFF_FACTOR,
  FIRST_BACKOFF_MS,
  MAX_BACKOFF_MS,
  nextBatchLimit,
  planNextDelayMs,
} from './domain/schedule.js';
import { createRequestId } from './request-id.js';
import { type SendAttemptDeps, sendAttempt } from './send-attempt.js';

/** What a send cycle logs through. */
export type CycleLogger = Pick<AgentLogger, 'debug' | 'info' | 'warn' | 'error'>;

export interface SenderOptions extends SendAttemptDeps {
  /** Each cycle logs through `child({ reqId })`, so its lines carry the cycle id. */
  readonly logger: CycleLogger & { child(bindings: { reqId: string }): CycleLogger };
  /** Names a send cycle; it goes to the gateway as `x-request-id`. Defaults to a random id. */
  readonly newCycleId?: () => string;
  readonly now?: () => number;
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
  /** Resolves once no request is in flight. A backoff wait is not a send in flight. */
  whenIdle(): Promise<void>;
  readonly state: SenderState;
}

/** What one send cycle logs under, and what it reports when it ends. */
interface CycleContext {
  readonly reqId: string;
  readonly logger: CycleLogger;
  retries: number;
}

/** A failed attempt, thrown so p-retry backs off and tries again. */
class SendFailed extends Error {
  override readonly name = 'SendFailed';
}

/**
 * A send cycle starts on the regular schedule. While the gateway is
 * unreachable, p-retry repeats it with an exponential backoff (SPEC §4.3), and
 * only an answered attempt arms the next cycle, so sends never overlap and a
 * slow gateway never queues a burst of requests.
 */
export function createSender(options: SenderOptions): Sender {
  const newCycleId = options.newCycleId ?? ((): string => createRequestId());
  const now = options.now ?? Date.now;
  // Fail at startup, not on every send, if the version cannot pass the contract.
  IngestBatch.shape.agentVersion.parse(options.agentVersion);

  let state: SenderState = 'idle';
  let handle: ReturnType<typeof setTimeout> | undefined;
  // The whole cycle, backoff waits included: `stop` waits for it.
  let cycle: Promise<void> = Promise.resolve();
  // Only the request itself: `whenIdle` waits for it.
  let request: Promise<unknown> = Promise.resolve();
  // Cancels the backoff wait of the cycle on pause and stop.
  let cancel = new AbortController();
  let limit: number = LIMITS.ingestSamples;

  async function attempt(cycle: CycleContext): Promise<AnsweredAttempt> {
    try {
      const result = await sendAttempt({ ...options, logger: cycle.logger }, limit, cycle.reqId);
      if (result.kind !== 'failed') {
        return result;
      }
    } catch (error: unknown) {
      // The buffer itself failed (disk full, permissions): retry on the backoff.
      const name = error instanceof Error ? error.name : typeof error;
      cycle.logger.error({ error: name }, 'send attempt failed');
    }
    throw new SendFailed('the batch was not delivered');
  }

  async function sendWithBackoff(
    signal: AbortSignal,
    cycle: CycleContext,
  ): Promise<AnsweredAttempt> {
    const { logger } = cycle;
    let failures = 0;
    const answered = await pRetry(
      () => {
        const inFlight = attempt(cycle);
        request = inFlight.catch(() => undefined);
        return inFlight;
      },
      {
        retries: Number.POSITIVE_INFINITY,
        minTimeout: FIRST_BACKOFF_MS,
        factor: BACKOFF_FACTOR,
        maxTimeout: MAX_BACKOFF_MS,
        signal,
        onFailedAttempt: ({ retryDelay }) => {
          failures += 1;
          logger.warn({ failures, retryInMs: retryDelay }, 'backing off');
        },
      },
    );
    cycle.retries = failures;
    if (failures > 0) {
      logger.info({ failures }, 'gateway reachable again');
    }
    return answered;
  }

  /** One line when a cycle that had something to send ends: how long, how many retries, how. */
  function logCycleDone(cycle: CycleContext, result: AnsweredAttempt, startedAt: number): void {
    if (result.kind === 'empty') {
      return;
    }
    const durationMs = now() - startedAt;
    cycle.logger.info(
      { durationMs, retries: cycle.retries, result: result.kind },
      `send cycle done ${durationMs}ms`,
    );
  }

  async function run(signal: AbortSignal): Promise<void> {
    let result: AnsweredAttempt;
    const reqId = newCycleId();
    const cycle: CycleContext = { reqId, logger: options.logger.child({ reqId }), retries: 0 };
    const startedAt = now();
    try {
      result = await sendWithBackoff(signal, cycle);
    } catch (error: unknown) {
      if (signal.aborted) {
        return;
      }
      // Nothing may end the loop: a cycle nobody awaits would reject unhandled.
      const name = error instanceof Error ? error.name : typeof error;
      cycle.logger.error({ error: name }, 'send cycle failed');
      arm(FIRST_BACKOFF_MS, signal);
      return;
    }
    logCycleDone(cycle, result, startedAt);
    limit = nextBatchLimit(limit, LIMITS.ingestSamples, result);
    if (state === 'running' && !signal.aborted) {
      arm(planNextDelayMs(result), signal);
    }
  }

  function arm(delayMs: number, signal: AbortSignal): void {
    handle = setTimeout(() => {
      handle = undefined;
      cycle = run(signal);
    }, delayMs);
  }

  function disarm(): void {
    cancel.abort();
    cancel = new AbortController();
    if (handle !== undefined) {
      clearTimeout(handle);
      handle = undefined;
    }
  }

  function startNow(): void {
    state = 'running';
    const { signal } = cancel;
    // A cycle still settling from before a pause finishes first, then the new one starts.
    cycle = cycle.then(() => run(signal));
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
      await cycle;
    },
    async whenIdle(): Promise<void> {
      // Lets a cycle that just woke start its request, and then arm its next timer.
      await setImmediate();
      await request;
      await setImmediate();
    },
    get state(): SenderState {
      return state;
    },
  };
}
