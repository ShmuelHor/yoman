import { IngestBatch, IngestResult } from '@yoman/shared/ingest';
import { describe, expect, it } from 'vitest';

import { STATUS } from '../../harness.js';
import { batterySample, windowSample } from './samples.js';

/**
 * Runs against a live compose stack (`docker compose up -d`, gateway rebuilt
 * from this branch): set `YOMAN_GATEWAY_URL` (`http://127.0.0.1:4711`) and
 * `YOMAN_AGENT_TOKEN` (the stack's `AGENT_TOKEN`, from the shell, never a file
 * in the repo). Without them the suite is skipped, as in plain `npm test`.
 */
const { YOMAN_GATEWAY_URL: GATEWAY_URL, YOMAN_AGENT_TOKEN: AGENT_TOKEN } = process.env;
const configured = GATEWAY_URL !== undefined && AGENT_TOKEN !== undefined;

const MS_PER_MINUTE = 60_000;

async function post(batch: IngestBatch): Promise<{ status: number; body: unknown }> {
  const response = await fetch(new URL('/v1/ingest', GATEWAY_URL), {
    method: 'POST',
    headers: { authorization: `Bearer ${AGENT_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(IngestBatch.parse(batch)),
  });
  return { status: response.status, body: await response.json() };
}

describe.skipIf(!configured)('POST /v1/ingest against compose', () => {
  it('stores a batch through the real services and answers with a valid result', async () => {
    // A fresh minute per run: the stack keeps what earlier runs stored.
    const ts = new Date(Math.floor(Date.now() / MS_PER_MINUTE) * MS_PER_MINUTE).toISOString();
    const batch: IngestBatch = {
      agentVersion: '0.1.0',
      samples: [
        { ...windowSample, ts },
        { ...batterySample, ts },
      ],
    };

    const { status, body } = await post(batch);

    expect(status).toBe(STATUS.OK);
    const result = IngestResult.parse(body);
    expect(result.degraded).toEqual([]);
    expect(result.accepted).toBeGreaterThan(0);
  });

  it('accepts nothing new when the same batch is sent again', async () => {
    const ts = new Date(Math.floor(Date.now() / MS_PER_MINUTE) * MS_PER_MINUTE).toISOString();
    const batch: IngestBatch = {
      agentVersion: '0.1.0',
      samples: [{ ...windowSample, ts }],
    };
    await post(batch);

    const { body } = await post(batch);

    expect(IngestResult.parse(body).accepted).toBe(0);
  });
});
