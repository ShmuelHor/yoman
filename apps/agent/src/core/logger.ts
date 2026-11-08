import { type DestinationStream, type Logger, pino } from 'pino';
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

export interface LoggerOptions {
  readonly level: LogLevel;
  /** Defaults to stdout, which journald captures for the systemd user unit. */
  readonly destination?: DestinationStream;
}

export type AgentLogger = Logger;

export function createLogger(options: LoggerOptions): AgentLogger {
  return pino(
    {
      name: 'yoman-agent',
      level: options.level,
      redact: { paths: redactPaths(), censor: CENSOR },
    },
    options.destination ?? pino.destination({ fd: 1, sync: false }),
  );
}
