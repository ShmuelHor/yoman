import type { IngestBatch } from '@yoman/shared/ingest';
import { describe, expect, it, vi } from 'vitest';
import {
  createIngestClient,
  type FetchFn,
  IngestRequestError,
  MAX_REPLY_BYTES,
} from '../../../src/sender/adapters/ingest-client.js';

const GATEWAY_URL = 'http://127.0.0.1:4711/';
const TOKEN = 'dGVzdC10b2tlbi1ub3QtYS1zZWNyZXQ';
const HTTP_OK = 200;
const HTTP_TOO_MANY = 429;
const RETRY_SECONDS = '10';
const BATCH: IngestBatch = {
  agentVersion: '0.0.0',
  samples: [
    {
      kind: 'thermal',
      ts: '2026-11-10T08:00:00.000Z',
      cpuTempC: 51.5,
      throttled: false,
    },
  ],
};

function respondWith(response: Response): ReturnType<typeof vi.fn<FetchFn>> {
  return vi.fn<FetchFn>().mockResolvedValue(response);
}

function failWith(error: Error): ReturnType<typeof vi.fn<FetchFn>> {
  return vi.fn<FetchFn>().mockRejectedValue(error);
}

async function rejection(promise: Promise<unknown>): Promise<IngestRequestError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof IngestRequestError)) {
    throw new Error('expected an IngestRequestError');
  }
  return error;
}

describe('createIngestClient', () => {
  it('posts the batch as JSON with the Bearer token and refuses redirects', async () => {
    const fetch = respondWith(Response.json({ ok: true }));
    const client = createIngestClient({ gatewayUrl: GATEWAY_URL, agentToken: TOKEN, fetch });

    await client.post(BATCH);

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('http://127.0.0.1:4711/v1/ingest');
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('error');
    expect(init?.headers).toEqual({
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    });
    expect(JSON.parse(String(init?.body))).toEqual(BATCH);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns the status, Retry-After and parsed JSON body', async () => {
    const fetch = respondWith(
      Response.json(
        { code: 'RATE_LIMITED' },
        { status: HTTP_TOO_MANY, headers: { 'retry-after': RETRY_SECONDS } },
      ),
    );
    const client = createIngestClient({ gatewayUrl: GATEWAY_URL, agentToken: TOKEN, fetch });

    await expect(client.post(BATCH)).resolves.toEqual({
      status: HTTP_TOO_MANY,
      retryAfter: RETRY_SECONDS,
      body: { code: 'RATE_LIMITED' },
    });
  });

  it.each([
    ['an empty body', ''],
    ['a body that is not JSON', '<html>'],
  ])('returns an undefined body for %s', async (_label, text) => {
    const fetch = respondWith(new Response(text, { status: HTTP_OK }));
    const client = createIngestClient({ gatewayUrl: GATEWAY_URL, agentToken: TOKEN, fetch });

    const reply = await client.post(BATCH);

    expect(reply.body).toBeUndefined();
  });

  it('reports a refused connection as unreachable', async () => {
    const refused = new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    const client = createIngestClient({
      gatewayUrl: GATEWAY_URL,
      agentToken: TOKEN,
      fetch: failWith(refused),
    });

    const error = await rejection(client.post(BATCH));

    expect(error.code).toBe('UNREACHABLE');
    expect(error.cause).toBe(refused);
  });

  it('reports an aborted request as a timeout', async () => {
    const timeout = new DOMException('The operation timed out.', 'TimeoutError');
    const client = createIngestClient({
      gatewayUrl: GATEWAY_URL,
      agentToken: TOKEN,
      fetch: failWith(timeout),
    });

    expect((await rejection(client.post(BATCH))).code).toBe('TIMEOUT');
  });

  it('reports a body that times out mid-read as a timeout', async () => {
    const body = new ReadableStream({
      start(controller): void {
        controller.error(new DOMException('aborted', 'AbortError'));
      },
    });
    const client = createIngestClient({
      gatewayUrl: GATEWAY_URL,
      agentToken: TOKEN,
      fetch: respondWith(new Response(body)),
    });

    expect((await rejection(client.post(BATCH))).code).toBe('TIMEOUT');
  });

  it('refuses a reply that declares more than the size cap', async () => {
    const response = new Response('{}', {
      headers: { 'content-length': String(MAX_REPLY_BYTES + 1) },
    });
    const client = createIngestClient({
      gatewayUrl: GATEWAY_URL,
      agentToken: TOKEN,
      fetch: respondWith(response),
    });

    expect((await rejection(client.post(BATCH))).code).toBe('REPLY_TOO_LARGE');
  });

  it('refuses a reply bigger than the size cap', async () => {
    const response = new Response('x'.repeat(MAX_REPLY_BYTES + 1));
    const client = createIngestClient({
      gatewayUrl: GATEWAY_URL,
      agentToken: TOKEN,
      fetch: respondWith(response),
    });

    expect((await rejection(client.post(BATCH))).code).toBe('REPLY_TOO_LARGE');
  });

  it.each([
    ['empty', ''],
    ['with a space', 'abc def'],
    ['with a newline', 'abc\ndef'],
  ])('rejects a token that is %s without echoing it', (_label, agentToken) => {
    const create = (): unknown => createIngestClient({ gatewayUrl: GATEWAY_URL, agentToken });

    expect(create).toThrow(IngestRequestError);
    expect(create).toThrow('ingest request failed: INVALID_TOKEN');
  });
});
