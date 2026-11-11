import type { AgentLogger } from './logger.js';

/**
 * The scheduler's `onError` for collectors: one line with the collector's name
 * and the error's class. Never the message, which can carry a window title or a
 * command line the collector was reading.
 */
export function logCollectorError(
  logger: Pick<AgentLogger, 'error'>,
): (name: string, error: unknown) => void {
  return (name, error) => {
    logger.error(
      { collector: name, error: error instanceof Error ? error.name : typeof error },
      'collector failed',
    );
  };
}
