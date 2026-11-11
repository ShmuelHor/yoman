import { createRequire } from 'node:module';
import { type DestinationStream, type Logger, pino } from 'pino';
import type { PrettyOptions } from 'pino-pretty';
import type { LogLevel } from './config.js';

/** SECURITY A11: these keys never reach a log, wherever they appear in a log object. */
export const REDACTED_KEYS = ['authorization', 'cookie', 'title', 'cmdline', 'token', 'password'];
export const CENSOR = '[redacted]';

/**
 * Redaction paths for every key at the top level, two levels down, and inside
 * arrays at those levels (a batch of samples, a list of windows). Exact paths
 * keep pino's redaction fast; deeper nesting is not logged by the agent.
 */
function redactPaths(): string[] {
  const prefixes = ['', '*.', '*.*.', '*[*].', '*.*[*].', '*[*].*.'];
  return prefixes.flatMap((prefix) => REDACTED_KEYS.map((key) => `${prefix}${key}`));
}

type PrettyFactory = (options: PrettyOptions) => DestinationStream;

function isPrettyFactory(value: unknown): value is PrettyFactory {
  return typeof value === 'function';
}

/**
 * pino-pretty is loaded only when asked for. The stream sits behind pino's own
 * redaction, which has already run by then. One line per entry, `reqId` included.
 */
function prettyStream(destination: DestinationStream | undefined): DestinationStream {
  const loaded: unknown = createRequire(import.meta.url)('pino-pretty');
  if (!isPrettyFactory(loaded)) {
    throw new Error('pino-pretty did not export a factory');
  }
  return loaded({
    colorize: true,
    singleLine: true,
    sync: true,
    ...(destination ? { destination } : {}),
  });
}

export interface LoggerOptions {
  readonly level: LogLevel;
  /** One readable line per entry (`logFormat: pretty`) instead of JSON. */
  readonly pretty?: boolean;
  /** Defaults to stdout, which journald captures for the systemd user unit. */
  readonly destination?: DestinationStream;
}

export type AgentLogger = Logger;

function stdout(): DestinationStream {
  return pino.destination({ fd: 1, sync: false });
}

export function createLogger(options: LoggerOptions): AgentLogger {
  return pino(
    {
      name: 'yoman-agent',
      level: options.level,
      redact: { paths: redactPaths(), censor: CENSOR },
    },
    options.pretty ? prettyStream(options.destination) : (options.destination ?? stdout()),
  );
}
