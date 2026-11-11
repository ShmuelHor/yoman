import type { IngestBatch } from '@yoman/shared/ingest';
import { routes } from '@yoman/shared/routes';
import { z } from 'zod';

/** The gateway answers within its 3 s per-service timeouts; this leaves room for a slow fan-out. */
export const REQUEST_TIMEOUT_MS = 15_000;
/** An ingest reply is a few alerts. Anything bigger is not the gateway talking. */
export const MAX_REPLY_BYTES = 1_048_576;

const MAX_TOKEN_LENGTH = 256;

/** `AGENT_TOKEN` in the gateway's `Bearer` grammar (RFC 6750 §2.1), so it fits the header. */
export const AgentToken = z
  .string()
  .max(MAX_TOKEN_LENGTH)
  .regex(/^[A-Za-z0-9._~+/-]+=*$/);

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export interface IngestClientOptions {
  /** A bare loopback origin, already validated by the agent config. */
  readonly gatewayUrl: string;
  readonly agentToken: string;
  readonly fetch?: FetchFn;
  readonly timeoutMs?: number;
}

/** What came back over HTTP. The body is untrusted until the sender parses it. */
export interface IngestHttpReply {
  readonly status: number;
  readonly retryAfter: string | null;
  /** The JSON body, or `undefined` when there was none or it was not JSON. */
  readonly body: unknown;
}

export type IngestErrorCode = 'INVALID_TOKEN' | 'UNREACHABLE' | 'TIMEOUT' | 'REPLY_TOO_LARGE';

/** The request could not be made, or did not get an HTTP answer the sender can use. */
export class IngestRequestError extends Error {
  override readonly name = 'IngestRequestError';

  constructor(
    readonly code: IngestErrorCode,
    options?: ErrorOptions,
  ) {
    super(`ingest request failed: ${code}`, options);
  }
}

export interface IngestClient {
  /** `requestId` goes out as `x-request-id`, so the gateway and services log under the same id. */
  post(batch: IngestBatch, requestId?: string): Promise<IngestHttpReply>;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

async function readJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_REPLY_BYTES) {
    throw new IngestRequestError('REPLY_TOO_LARGE');
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_REPLY_BYTES) {
    throw new IngestRequestError('REPLY_TOO_LARGE');
  }
  if (text === '') {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * `POST /v1/ingest` with the agent's Bearer token. Redirects are refused, so
 * the token never follows a `Location` away from the loopback gateway.
 */
export function createIngestClient(options: IngestClientOptions): IngestClient {
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const url = new URL(routes.ingest.path, options.gatewayUrl).href;
  const token = AgentToken.safeParse(options.agentToken);
  if (!token.success) {
    // Never the zod error: its issues would carry the secret.
    throw new IngestRequestError('INVALID_TOKEN');
  }
  const authorization = `Bearer ${token.data}`;

  return {
    async post(batch, requestId): Promise<IngestHttpReply> {
      let response: Response;
      try {
        response = await fetchFn(url, {
          method: routes.ingest.method,
          headers: {
            authorization,
            'content-type': 'application/json',
            ...(requestId === undefined ? {} : { 'x-request-id': requestId }),
          },
          body: JSON.stringify(batch),
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error: unknown) {
        throw new IngestRequestError(isTimeout(error) ? 'TIMEOUT' : 'UNREACHABLE', {
          cause: error,
        });
      }
      try {
        const body = await readJson(response);
        return { status: response.status, retryAfter: response.headers.get('retry-after'), body };
      } catch (error: unknown) {
        if (error instanceof IngestRequestError) {
          throw error;
        }
        throw new IngestRequestError(isTimeout(error) ? 'TIMEOUT' : 'UNREACHABLE', {
          cause: error,
        });
      }
    },
  };
}
