import { type DestinationStream, type Logger, type LoggerOptions, pino } from 'pino';

import type { LogLevel } from './config.js';

/** SECURITY A11: these keys never reach a log line, wherever they appear in a log object. */
const SENSITIVE_KEYS = ['authorization', 'cookie', 'title', 'cmdline', 'token', 'password'];

export const CENSOR = '[Redacted]';

/** The key at the top level and up to three levels down (`a.b.title`, `samples.0.title`). */
const REDACT_PATHS = SENSITIVE_KEYS.flatMap((key) => [
  key,
  `*.${key}`,
  `*.*.${key}`,
  `*.*.*.${key}`,
]);

interface LoggedRequest {
  readonly id?: unknown;
  readonly method?: unknown;
  readonly url?: unknown;
}

/**
 * The path only, and no headers. A query string can carry a title filter, and
 * headers carry the agent token and the session cookie.
 */
export function serializeRequest(request: LoggedRequest): Record<string, unknown> {
  const url = typeof request.url === 'string' ? request.url : '';
  const queryStart = url.indexOf('?');
  return {
    id: request.id,
    method: request.method,
    path: queryStart === -1 ? url : url.slice(0, queryStart),
  };
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const code = 'code' in error ? error.code : undefined;
    return { type: error.name, message: error.message, stack: error.stack, code };
  }
  return { type: typeof error };
}

export function buildLoggerOptions(level: LogLevel): LoggerOptions {
  return {
    name: 'gateway',
    level,
    redact: { paths: REDACT_PATHS, censor: CENSOR },
    serializers: { req: serializeRequest, err: serializeError },
  };
}

export function createLogger(level: LogLevel, destination?: DestinationStream): Logger {
  const options = buildLoggerOptions(level);
  return destination === undefined ? pino(options) : pino(options, destination);
}
