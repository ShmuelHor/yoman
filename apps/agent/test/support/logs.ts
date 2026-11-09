import { type AgentLogger, createLogger } from '../../src/core/logger.js';

/** A logger that keeps every entry as parsed JSON, for assertions on what was logged. */
export function recordingLogger(): { logger: AgentLogger; logs: unknown[] } {
  const logs: unknown[] = [];
  const destination = {
    write: (line: string): void => {
      const entry: unknown = JSON.parse(line);
      logs.push(entry);
    },
  };
  return { logger: createLogger({ level: 'info', destination }), logs };
}
