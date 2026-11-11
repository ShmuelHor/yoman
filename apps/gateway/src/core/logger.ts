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

/**
 * One readable line per entry, for `docker compose logs` and a terminal. The
 * transport runs in a worker thread on lines that were already redacted.
 * `reqId` stays on the line so one request can be followed across services.
 */
const PRETTY_TRANSPORT = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    singleLine: true,
    translateTime: 'SYS:HH:MM:ss.l',
    ignore: 'pid,hostname',
  },
};

export function buildLoggerOptions(level: LogLevel, pretty = false): LoggerOptions {
  return {
    name: 'gateway',
    level,
    ...(pretty ? { transport: PRETTY_TRANSPORT } : {}),
    redact: { paths: REDACT_PATHS, censor: CENSOR },
    serializers: { req: serializeRequest, err: serializeError },
  };
}

/** A `destination` (tests) wins over `pretty`. */
export function createLogger(
  level: LogLevel,
  destination?: DestinationStream,
  pretty = false,
): Logger {
  return destination === undefined
    ? pino(buildLoggerOptions(level, pretty))
    : pino(buildLoggerOptions(level), destination);
}
