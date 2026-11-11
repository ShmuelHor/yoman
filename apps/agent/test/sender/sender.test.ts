import type { IngestResult } from '@yoman/shared/ingest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BufferBatch, SampleBuffer } from '../../src/core/buffer.js';
import type { IngestClient, IngestHttpReply } from '../../src/sender/adapters/ingest-client.js';
import { IngestRequestError } from '../../src/sender/adapters/ingest-client.js';
import {
  DRAIN_INTERVAL_MS,
  MAX_BACKOFF_MS,
  SEND_INTERVAL_MS,
} from '../../src/sender/domain/schedule.js';
import type { ReplyHandler } from '../../src/sender/reply-handlers.js';
import { type CycleLogger, createSender, type Sender } from '../../src/sender/sender.js';
import { recordingLogger } from '../support/logs.js';
import { VirtualTimers } from './virtual-timers.js';

const AGENT_VERSION = '0.0.0';
const STATUS_OK = 200;
const STATUS_TOO_LARGE = 413;
const FULL_BATCH = 2_000;
const HALF_BATCH = 1_000;
const TWO_MINUTES = 120_000;
const FOUR_MINUTES = 240_000;
const ONE_HOUR = 3_600_000;
const SHORT_OUTAGE = 3;
const LONG_OUTAGE = 20;

const CYCLE_MS = 41;

const SAMPLE = {
  kind: 'thermal',
  ts: '2026-11-10T08:00:00.000Z',
  cpuTempC: 50,
  throttled: false,
} as const;

const OK_REPLY: IngestResult = { accepted: 1, deliver: [], queued: 0, degraded: [] };

type Step = IngestHttpReply | Error;

/** A buffer that always holds one sample, and records each read limit and ack. */
function stubBuffer(): Pick<SampleBuffer, 'read' | 'ack'> & { limits: number[]; acks: number } {
  const batch: BufferBatch = { samples: [SAMPLE], cursors: [] };
  const stub = {
    limits: [] as number[],
    acks: 0,
    read: async (limit?: number): Promise<BufferBatch> => {
      stub.limits.push(limit ?? FULL_BATCH);
      return batch;
    },
    ack: async (): Promise<void> => {
      stub.acks += 1;
    },
  };
  return stub;
}

describe('createSender', () => {
  let timers: VirtualTimers;
  let buffer: ReturnType<typeof stubBuffer>;
  let steps: Step[];
  let postedAt: number[];
  let sender: Sender;
  let logs: unknown[];

  function create(overrides: { buffer?: Pick<SampleBuffer, 'read' | 'ack'> } = {}): Sender {
    const recorded = recordingLogger();
    logs = recorded.logs;
    const client: IngestClient = {
      post: async () => {
        postedAt.push(timers.now);
        const step = steps.shift() ?? { status: STATUS_OK, retryAfter: null, body: OK_REPLY };
        if (step instanceof Error) {
          throw step;
        }
        return step;
      },
    };
    return createSender({
      buffer: overrides.buffer ?? buffer,
      client,
      agentVersion: AGENT_VERSION,
      logger: recorded.logger,
      replyHandlers: [],
    });
  }

  async function advance(ms: number): Promise<void> {
    await timers.advanceTo(timers.now + ms, () => sender.whenIdle());
  }

  function unreachable(times: number): Step[] {
    return Array.from({ length: times }, () => new IngestRequestError('UNREACHABLE'));
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    timers = new VirtualTimers();
    timers.install();
    buffer = stubBuffer();
    steps = [];
    postedAt = [];
    sender = create();
  });

  it('sends at start, then every minute', async () => {
    sender.start();
    await sender.whenIdle();
    await advance(2 * SEND_INTERVAL_MS);

    expect(postedAt).toEqual([0, SEND_INTERVAL_MS, 2 * SEND_INTERVAL_MS]);
  });

  it('backs off while the gateway is down, then returns to every minute', async () => {
    steps.push(...unreachable(SHORT_OUTAGE));
    sender.start();
    await sender.whenIdle();
    await advance(ONE_HOUR);

    const expected = [TWO_MINUTES, FOUR_MINUTES, 2 * FOUR_MINUTES, SEND_INTERVAL_MS];
    const gaps = postedAt.slice(1).map((at, index) => at - (postedAt[index] ?? 0));
    expect(gaps.slice(0, expected.length)).toEqual(expected);
    expect(logs).toContainEqual(
      expect.objectContaining({ msg: 'gateway reachable again', failures: SHORT_OUTAGE }),
    );
  });

  it('names each send cycle and logs its batch, duration and retries under that id', async () => {
    const recorded = recordingLogger();
    logs = recorded.logs;
    let clock = 0;
    const ticks = [0, CYCLE_MS];
    sender = createSender({
      buffer,
      client: { post: async () => ({ status: STATUS_OK, retryAfter: null, body: OK_REPLY }) },
      agentVersion: AGENT_VERSION,
      logger: recorded.logger,
      replyHandlers: [],
      newCycleId: () => 'req-7f3a',
      now: () => ticks[clock++] ?? CYCLE_MS,
    });

    sender.start();
    await sender.whenIdle();

    expect(logs).toContainEqual(
      expect.objectContaining({ msg: 'send cycle started', reqId: 'req-7f3a', batch: 1 }),
    );
    expect(logs).toContainEqual(
      expect.objectContaining({
        msg: `send cycle done ${CYCLE_MS}ms`,
        reqId: 'req-7f3a',
        durationMs: CYCLE_MS,
        retries: 0,
        result: 'sent',
      }),
    );
  });

  it('sends the cycle id to the gateway as the request id of every attempt', async () => {
    const requestIds: (string | undefined)[] = [];
    sender = createSender({
      buffer,
      client: {
        post: async (_batch, requestId) => {
          requestIds.push(requestId);
          return { status: STATUS_OK, retryAfter: null, body: OK_REPLY };
        },
      },
      agentVersion: AGENT_VERSION,
      logger: recordingLogger().logger,
      replyHandlers: [],
      newCycleId: () => 'req-7f3a',
    });

    sender.start();
    await sender.whenIdle();

    expect(requestIds).toEqual(['req-7f3a']);
  });

  it('never waits more than 10 minutes between attempts', async () => {
    steps.push(...unreachable(LONG_OUTAGE));
    sender.start();
    await sender.whenIdle();
    await advance(ONE_HOUR);

    const gaps = postedAt.slice(1).map((at, index) => at - (postedAt[index] ?? 0));
    expect(Math.max(...gaps)).toBe(MAX_BACKOFF_MS);
  });

  it('retries a refused size with half the samples, then restores the full batch', async () => {
    steps.push({ status: STATUS_TOO_LARGE, retryAfter: null, body: undefined });
    sender.start();
    await sender.whenIdle();
    await advance(2 * DRAIN_INTERVAL_MS);

    // The stub's batch is one sample, so the retry asks for the floor of one,
    // fills it, and drains again with the full size.
    expect(buffer.limits).toEqual([FULL_BATCH, 1, FULL_BATCH]);
    expect(postedAt).toEqual([0, DRAIN_INTERVAL_MS, 2 * DRAIN_INTERVAL_MS]);
  });

  it('keeps the schedule when the buffer throws', async () => {
    const broken = {
      read: (): Promise<BufferBatch> => Promise.reject(new Error('EACCES')),
      ack: (): Promise<void> => Promise.resolve(),
    };
    sender = create({ buffer: broken });
    sender.start();
    await sender.whenIdle();

    expect(timers.armedDelays).toEqual([TWO_MINUTES]);
    expect(logs).toContainEqual(expect.objectContaining({ msg: 'send attempt failed' }));
  });

  it('sends nothing while paused, and sends at once on resume', async () => {
    sender.start();
    await sender.whenIdle();
    sender.pause();
    await advance(ONE_HOUR);

    expect(postedAt).toEqual([0]);
    expect(sender.state).toBe('paused');

    sender.resume();
    await sender.whenIdle();

    expect(postedAt).toEqual([0, ONE_HOUR]);
    expect(timers.armedDelays).toEqual([SEND_INTERVAL_MS]);
  });

  it('sends nothing and arms nothing when paused before the first send', async () => {
    sender.start();
    sender.pause();
    await sender.whenIdle();

    expect(postedAt).toEqual([]);
    expect(timers.armedDelays).toEqual([]);
  });

  it('waits for the send in flight on stop, then never sends again', async () => {
    sender.start();
    await sender.whenIdle();
    await sender.stop();

    expect(buffer.acks).toBe(1);
    expect(sender.state).toBe('stopped');
    await advance(ONE_HOUR);
    expect(postedAt).toEqual([0]);
  });

  it('stops waiting for the backoff on pause, then sends at once on resume', async () => {
    steps.push(...unreachable(1));
    sender.start();
    await sender.whenIdle();
    expect(timers.armedDelays).toEqual([TWO_MINUTES]);

    sender.pause();
    expect(timers.armedDelays).toEqual([]);
    await advance(ONE_HOUR);
    expect(postedAt).toEqual([0]);

    sender.resume();
    await sender.whenIdle();

    expect(postedAt).toEqual([0, ONE_HOUR]);
  });

  it('logs an unexpected error and keeps the loop alive', async () => {
    const logs: unknown[] = [];
    const failing: CycleLogger & { child(): CycleLogger } = {
      child: () => failing,
      debug: (): void => undefined,
      info: (): void => undefined,
      error: (fields: unknown): void => void logs.push(fields),
      // Throws inside the backoff callback, which is where p-retry cannot recover.
      warn: (): void => {
        throw new TypeError('logger broke');
      },
    };
    sender = createSender({
      buffer,
      client: { post: () => Promise.reject(new IngestRequestError('UNREACHABLE')) },
      agentVersion: AGENT_VERSION,
      logger: failing,
      replyHandlers: [],
    });
    sender.start();
    await sender.whenIdle();

    expect(logs).toContainEqual({ error: 'TypeError' });
    expect(timers.armedDelays).toEqual([TWO_MINUTES]);
  });

  it('ignores pause and resume when not running', () => {
    sender.pause();
    sender.resume();

    expect(sender.state).toBe('idle');
  });

  it('starts only once', () => {
    sender.start();

    expect(() => sender.start()).toThrow('cannot start a running sender');
  });

  it('rejects an agent version the contract would refuse', () => {
    expect(() =>
      createSender({
        buffer,
        client: { post: () => Promise.reject(new Error('unused')) },
        agentVersion: 'not a version',
        logger: recordingLogger().logger,
        replyHandlers: [] satisfies ReplyHandler[],
      }),
    ).toThrow();
  });

  it('halves a full batch the gateway refused', async () => {
    const big: BufferBatch = {
      samples: Array.from({ length: FULL_BATCH }, () => SAMPLE),
      cursors: [],
    };
    const limits: number[] = [];
    sender = create({
      buffer: {
        read: async (limit = FULL_BATCH) => {
          limits.push(limit);
          return { samples: big.samples.slice(0, limit), cursors: [] };
        },
        ack: async () => undefined,
      },
    });
    steps.push({ status: STATUS_TOO_LARGE, retryAfter: null, body: undefined });
    sender.start();
    await sender.whenIdle();
    await advance(DRAIN_INTERVAL_MS);

    expect(limits).toEqual([FULL_BATCH, HALF_BATCH]);
  });
});
