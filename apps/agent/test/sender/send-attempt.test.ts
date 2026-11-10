import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IngestBatch, IngestResult, Sample } from '@yoman/shared/ingest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuffer, type SampleBuffer } from '../../src/core/buffer.js';
import type { AgentLogger } from '../../src/core/logger.js';
import {
  type IngestClient,
  type IngestHttpReply,
  IngestRequestError,
} from '../../src/sender/adapters/ingest-client.js';
import type { ReplyHandler } from '../../src/sender/reply-handlers.js';
import { type SendAttemptDeps, sendAttempt } from '../../src/sender/send-attempt.js';
import { recordingLogger } from '../support/logs.js';

const AGENT_VERSION = '0.0.0';
const FULL_BATCH = 2_000;
const SMALL_LIMIT = 2;
const STATUS_OK = 200;
const STATUS_TOO_LARGE = 413;
const STATUS_TOO_MANY = 429;
const STATUS_UNAUTHORIZED = 401;
const STATUS_UNAVAILABLE = 503;
const RETRY_AFTER_SECONDS = 20;
const RETRY_AFTER_MS = 20_000;
const TITLE_LENGTH = 400;
const NOW = new Date('2026-11-10T08:00:00Z');

function windowSample(pid: number, title?: string): Sample {
  return {
    kind: 'window',
    ts: '2026-11-10T08:00:00.000Z',
    wmClass: 'firefox',
    pid,
    idleMs: 0,
    locked: false,
    ...(title === undefined ? {} : { title }),
  };
}

const PID_A = 101;
const PID_B = 102;
const PID_C = 103;
const PIDS = [PID_A, PID_B, PID_C];
const SAMPLES = PIDS.map((pid) => windowSample(pid));

const OK_REPLY: IngestResult = {
  accepted: SAMPLES.length,
  deliver: [
    {
      alertKey: 'battery:low',
      type: 'battery-low',
      level: 'important',
      ts: '2026-11-10T08:00:00.000Z',
      params: { percent: 15 },
    },
  ],
  queued: 0,
  degraded: [],
};

function httpReply(
  status: number,
  body?: unknown,
  retryAfter: string | null = null,
): IngestHttpReply {
  return { status, retryAfter, body };
}

function pidsOf(samples: readonly Sample[]): number[] {
  return samples.flatMap((sample) => (sample.kind === 'window' ? [sample.pid] : []));
}

describe('sendAttempt', () => {
  let root: string;
  let buffer: SampleBuffer;
  let posted: IngestBatch[];
  let replies: (IngestHttpReply | Error)[];
  let handled: IngestResult[];
  let logs: unknown[];
  let logger: AgentLogger;

  const client: IngestClient = {
    post: async (batch) => {
      posted.push(batch);
      const next = replies.shift() ?? httpReply(STATUS_OK, OK_REPLY);
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };

  function deps(overrides: Partial<SendAttemptDeps> = {}): SendAttemptDeps {
    const recorder: ReplyHandler = {
      name: 'recorder',
      handle: async (reply) => {
        handled.push(reply);
      },
    };
    return {
      buffer,
      client,
      agentVersion: AGENT_VERSION,
      logger,
      replyHandlers: [recorder],
      ...overrides,
    };
  }

  async function buffered(): Promise<number[]> {
    return pidsOf((await buffer.read()).samples);
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yoman-sender-'));
    ({ logger, logs } = recordingLogger());
    buffer = await createBuffer({
      stateDir: join(root, 'state'),
      bufferDir: join(root, 'state', 'buffer'),
      logger,
      now: () => NOW,
    });
    posted = [];
    replies = [];
    handled = [];
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('sends the oldest samples with the agent version', async () => {
    await buffer.append(SAMPLES);

    await sendAttempt(deps(), FULL_BATCH);

    expect(posted).toEqual([{ agentVersion: AGENT_VERSION, samples: SAMPLES }]);
  });

  it('deletes the samples after a 2xx and hands the reply to every handler', async () => {
    await buffer.append(SAMPLES);

    const result = await sendAttempt(deps(), FULL_BATCH);

    expect(result).toEqual({ kind: 'sent', more: false });
    expect(await buffered()).toEqual([]);
    expect(handled).toEqual([OK_REPLY]);
  });

  it.each([
    ['the gateway is unreachable', new IngestRequestError('UNREACHABLE'), { kind: 'failed' }],
    ['the request timed out', new IngestRequestError('TIMEOUT'), { kind: 'failed' }],
    ['the gateway is unavailable', httpReply(STATUS_UNAVAILABLE), { kind: 'failed' }],
    ['the token is rejected', httpReply(STATUS_UNAUTHORIZED), { kind: 'failed' }],
    [
      'the gateway is rate-limiting',
      httpReply(STATUS_TOO_MANY, undefined, String(RETRY_AFTER_SECONDS)),
      { kind: 'rate-limited', retryAfterMs: RETRY_AFTER_MS },
    ],
    [
      'the body is too large',
      httpReply(STATUS_TOO_LARGE),
      { kind: 'too-large', samples: SAMPLES.length },
    ],
  ])('keeps every sample when %s', async (_label, reply, expected) => {
    await buffer.append(SAMPLES);
    replies.push(reply);

    const result = await sendAttempt(deps(), FULL_BATCH);

    expect(result).toEqual(expected);
    expect(await buffered()).toEqual(PIDS);
    expect(handled).toEqual([]);
  });

  it('logs the token problem as an error, without the token', async () => {
    await buffer.append(SAMPLES);
    replies.push(httpReply(STATUS_UNAUTHORIZED));

    await sendAttempt(deps(), FULL_BATCH);

    expect(logs).toContainEqual(
      expect.objectContaining({
        msg: 'gateway rejected the agent token',
        status: STATUS_UNAUTHORIZED,
      }),
    );
  });

  it('sends nothing when the buffer is empty', async () => {
    const result = await sendAttempt(deps(), FULL_BATCH);

    expect(result).toEqual({ kind: 'empty' });
    expect(posted).toEqual([]);
  });

  it('reports a backlog when the batch hit the sample limit', async () => {
    await buffer.append(SAMPLES);

    const result = await sendAttempt(deps(), SMALL_LIMIT);

    expect(result).toEqual({ kind: 'sent', more: true });
    expect(pidsOf(posted[0]?.samples ?? [])).toEqual(PIDS.slice(0, SMALL_LIMIT));
    expect(await buffered()).toEqual(PIDS.slice(SMALL_LIMIT));
  });

  it('cuts the batch to the body budget and acks only what was sent', async () => {
    const big = PIDS.map((pid) => windowSample(pid, 'x'.repeat(TITLE_LENGTH)));
    await buffer.append(big);
    const twoSamples = JSON.stringify({ agentVersion: AGENT_VERSION, samples: big.slice(0, 2) });

    const result = await sendAttempt(
      deps({ maxBatchBytes: Buffer.byteLength(twoSamples) }),
      FULL_BATCH,
    );

    expect(result).toEqual({ kind: 'sent', more: true });
    expect(pidsOf(posted[0]?.samples ?? [])).toEqual(PIDS.slice(0, 2));
    expect(await buffered()).toEqual(PIDS.slice(2));
  });

  it('still sends one sample when even one is over the budget', async () => {
    await buffer.append(SAMPLES);

    await sendAttempt(deps({ maxBatchBytes: 1 }), FULL_BATCH);

    expect(pidsOf(posted[0]?.samples ?? [])).toEqual(PIDS.slice(0, 1));
  });

  it('acks a 2xx even when the reply breaks the contract, and skips the handlers', async () => {
    await buffer.append(SAMPLES);
    replies.push(httpReply(STATUS_OK, { accepted: 'all', deliver: [] }));

    const result = await sendAttempt(deps(), FULL_BATCH);

    expect(result).toEqual({ kind: 'sent', more: false });
    expect(await buffered()).toEqual([]);
    expect(handled).toEqual([]);
    expect(logs).toContainEqual(
      expect.objectContaining({ msg: 'ingest reply failed its contract; skipped its commands' }),
    );
  });

  it('runs the other handlers when one throws, and never resends', async () => {
    await buffer.append(SAMPLES);
    const failing: ReplyHandler = {
      name: 'notifier',
      handle: () => Promise.reject(new TypeError('secret window title')),
    };
    const after = vi.fn<ReplyHandler['handle']>().mockResolvedValue(undefined);

    const result = await sendAttempt(
      deps({ replyHandlers: [failing, { name: 'muter', handle: after }] }),
      FULL_BATCH,
    );

    expect(result).toEqual({ kind: 'sent', more: false });
    expect(after).toHaveBeenCalledWith(OK_REPLY);
    expect(await buffered()).toEqual([]);
    expect(logs).toContainEqual(
      expect.objectContaining({
        msg: 'reply handler failed',
        handler: 'notifier',
        error: 'TypeError',
      }),
    );
    expect(JSON.stringify(logs)).not.toContain('secret window title');
  });

  it('lets an unexpected client error reach the caller', async () => {
    await buffer.append(SAMPLES);
    replies.push(new RangeError('bug'));

    await expect(sendAttempt(deps(), FULL_BATCH)).rejects.toThrow(RangeError);
    expect(await buffered()).toEqual(PIDS);
  });
});
