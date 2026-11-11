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

/** The gateway allows one ingest per 10 s; this is a live stack, so the test really waits. */
const RATE_WINDOW_MS = 10_500;
const TEST_TIMEOUT_MS = 30_000;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!configured)('POST /v1/ingest against compose', () => {
  it(
    'stores a batch through the real services, and accepts nothing new when it is resent',
    async () => {
      // A fresh minute per run: the stack keeps what earlier runs stored.
      const ts = new Date(Math.floor(Date.now() / MS_PER_MINUTE) * MS_PER_MINUTE).toISOString();
      const batch: IngestBatch = {
        agentVersion: '0.1.0',
        samples: [
          { ...windowSample, ts },
          { ...batterySample, ts },
        ],
      };

      const first = await post(batch);
      await pause(RATE_WINDOW_MS);
      const resend = await post(batch);

      expect(first.status).toBe(STATUS.OK);
      const stored = IngestResult.parse(first.body);
      expect(stored.degraded).toEqual([]);
      expect(stored.accepted).toBeGreaterThan(0);
      expect(resend.status).toBe(STATUS.OK);
      expect(IngestResult.parse(resend.body).accepted).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );
});
