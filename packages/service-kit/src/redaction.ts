import { DatabaseError } from 'pg';
import type { LoggerOptions } from 'pino';

/** SECURITY A11. Window titles, command lines and credentials never reach a log line. */
const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'title',
  'cmdline',
  'token',
  'password',
] as const;

export const CENSOR = '[Redacted]';

/** The key at the top level and up to three levels down (`a.b.title`, `samples.0.title`). */
export const REDACT_PATHS: readonly string[] = SENSITIVE_KEYS.flatMap((key) => [
  key,
  `*.${key}`,
  `*.*.${key}`,
  `*.*.*.${key}`,
  `req.headers.${key}`,
]);

interface LoggedRequest {
  readonly id?: unknown;
  readonly method?: unknown;
  readonly url?: unknown;
}

/**
 * The path only. A query string can carry a title filter or a token, and
 * key-based redaction cannot see inside it. Headers are never logged.
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

/**
 * Postgres puts row values into `message` and `detail` ("Key (title)=(...)
 * already exists"), so a database error is logged by its SQLSTATE only.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof DatabaseError) {
    return { type: 'DatabaseError', code: error.code };
  }
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
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

export function buildLoggerOptions(name: string, level: string, pretty = false): LoggerOptions {
  return {
    name,
    level,
    ...(pretty ? { transport: PRETTY_TRANSPORT } : {}),
    redact: { paths: [...REDACT_PATHS], censor: CENSOR },
    serializers: { req: serializeRequest, err: serializeError },
  };
}
