import { type IngestBatch, IngestResult } from '@yoman/shared/ingest';
import type { BufferBatch, SampleBuffer } from '../core/buffer.js';
import type { AgentLogger } from '../core/logger.js';
import { type IngestClient, IngestRequestError } from './adapters/ingest-client.js';
import { fittingSampleCount, MAX_BATCH_BYTES } from './domain/batch-fit.js';
import { classifyIngestStatus } from './domain/ingest-reply.js';
import type { AttemptResult } from './domain/schedule.js';
import type { ReplyHandler } from './reply-handlers.js';

export interface SendAttemptDeps {
  readonly buffer: Pick<SampleBuffer, 'read' | 'ack'>;
  readonly client: IngestClient;
  readonly agentVersion: string;
  readonly logger: Pick<AgentLogger, 'debug' | 'warn' | 'error'>;
  readonly replyHandlers: readonly ReplyHandler[];
  readonly maxBatchBytes?: number;
}

/** Only the error's class and code: messages can carry upstream text. */
function describeError(error: unknown): { error: string; code?: string } {
  if (!(error instanceof Error)) {
    return { error: typeof error };
  }
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return code === undefined ? { error: error.name } : { error: error.name, code };
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}

/**
 * Reads the oldest samples and trims them to what fits in one request body.
 * A trimmed batch is read again with the smaller count, so its cursors ack
 * exactly the samples that were sent.
 */
async function readFittingBatch(
  deps: SendAttemptDeps,
  limit: number,
): Promise<{ batch: BufferBatch; more: boolean }> {
  const batch = await deps.buffer.read(limit);
  const envelope: IngestBatch = { agentVersion: deps.agentVersion, samples: [] };
  const fitting = fittingSampleCount(
    byteLength(envelope),
    batch.samples.map(byteLength),
    deps.maxBatchBytes ?? MAX_BATCH_BYTES,
  );
  // No single sample can come near the limit; sending one lets the gateway decide.
  const count = Math.max(1, fitting);
  if (count >= batch.samples.length) {
    return { batch, more: batch.samples.length >= limit };
  }
  return { batch: await deps.buffer.read(count), more: true };
}

async function dispatchReply(deps: SendAttemptDeps, body: unknown): Promise<void> {
  const reply = IngestResult.safeParse(body);
  if (!reply.success) {
    // The samples are already acked: the gateway took them. Only the commands are lost.
    const paths = reply.error.issues.map((issue) => issue.path.map(String).join('.'));
    deps.logger.warn({ paths }, 'ingest reply failed its contract; skipped its commands');
    return;
  }
  for (const handler of deps.replyHandlers) {
    try {
      await handler.handle(reply.data);
    } catch (error: unknown) {
      deps.logger.error({ handler: handler.name, ...describeError(error) }, 'reply handler failed');
    }
  }
}

async function onAccepted(
  deps: SendAttemptDeps,
  batch: BufferBatch,
  more: boolean,
  body: unknown,
): Promise<AttemptResult> {
  // Acked before the handlers run, so a failing handler never causes a resend.
  await deps.buffer.ack(batch);
  deps.logger.debug({ samples: batch.samples.length, more }, 'ingest batch accepted');
  await dispatchReply(deps, body);
  return { kind: 'sent', more };
}

/**
 * One send: the oldest buffered samples to `POST /v1/ingest`. The buffer is
 * acked only after a 2xx (SPEC §4.3); on anything else the samples stay and
 * the result tells the sender when to try again.
 */
export async function sendAttempt(deps: SendAttemptDeps, limit: number): Promise<AttemptResult> {
  const { batch, more } = await readFittingBatch(deps, limit);
  if (batch.samples.length === 0) {
    // Drops files that held only invalid lines or nothing at all.
    await deps.buffer.ack(batch);
    return { kind: 'empty' };
  }
  const samples = [...batch.samples];

  let reply: Awaited<ReturnType<IngestClient['post']>>;
  try {
    reply = await deps.client.post({ agentVersion: deps.agentVersion, samples });
  } catch (error: unknown) {
    if (error instanceof IngestRequestError) {
      deps.logger.warn({ code: error.code }, 'ingest request failed; samples stay buffered');
      return { kind: 'failed' };
    }
    throw error;
  }

  const status = classifyIngestStatus(reply.status, reply.retryAfter);
  switch (status.kind) {
    case 'accepted':
      return onAccepted(deps, batch, more, reply.body);
    case 'too-large':
      deps.logger.warn({ samples: samples.length }, 'gateway refused the batch size');
      return { kind: 'too-large', samples: samples.length };
    case 'rate-limited':
      deps.logger.warn({ retryAfterMs: status.retryAfterMs }, 'gateway rate-limited ingest');
      return { kind: 'rate-limited', retryAfterMs: status.retryAfterMs };
    case 'unauthorized':
      deps.logger.error({ status: reply.status }, 'gateway rejected the agent token');
      return { kind: 'failed' };
    case 'refused':
      deps.logger.warn(
        { status: reply.status },
        'gateway refused the batch; samples stay buffered',
      );
      return { kind: 'failed' };
  }
}
