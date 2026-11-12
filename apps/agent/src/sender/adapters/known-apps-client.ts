import type { KnownAppsReport } from '@yoman/shared/focus';
import { routes } from '@yoman/shared/routes';
import {
  AgentToken,
  type FetchFn,
  IngestRequestError,
  isTimeout,
  REQUEST_TIMEOUT_MS,
  readJson,
} from './ingest-client.js';

export interface KnownAppsClientOptions {
  /** A bare loopback origin, already validated by the agent config. */
  readonly gatewayUrl: string;
  readonly agentToken: string;
  readonly fetch?: FetchFn;
  readonly timeoutMs?: number;
}

/** What came back over HTTP. The body is untrusted until the reporter parses it. */
export interface KnownAppsHttpReply {
  readonly status: number;
  readonly body: unknown;
}

export interface KnownAppsClient {
  post(report: KnownAppsReport): Promise<KnownAppsHttpReply>;
}

/**
 * `POST /v1/focus/known-apps` with the agent's Bearer token. Like the ingest
 * client, it refuses redirects so the token never leaves the loopback gateway.
 */
export function createKnownAppsClient(options: KnownAppsClientOptions): KnownAppsClient {
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const route = routes.reportKnownApps;
  const url = new URL(route.path, options.gatewayUrl).href;
  const token = AgentToken.safeParse(options.agentToken);
  if (!token.success) {
    // Never the zod error: its issues would carry the secret.
    throw new IngestRequestError('INVALID_TOKEN');
  }
  const authorization = `Bearer ${token.data}`;

  return {
    async post(report): Promise<KnownAppsHttpReply> {
      try {
        const response = await fetchFn(url, {
          method: route.method,
          headers: { authorization, 'content-type': 'application/json' },
          body: JSON.stringify(report),
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        });
        return { status: response.status, body: await readJson(response) };
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
