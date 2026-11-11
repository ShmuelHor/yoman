import { type Logger, pino } from 'pino';

/** The fields the tracing tests look at; anything else stays in the index signature. */
export interface LogLine {
  readonly msg?: string;
  readonly reqId?: string;
  readonly source?: string;
  readonly route?: string;
  readonly status?: number;
  readonly level?: number;
  readonly [field: string]: unknown;
}

/** A logger that keeps every line as parsed JSON, for assertions on what was logged. */
export function recordingLogger(): { logger: Logger; lines: LogLine[] } {
  const lines: LogLine[] = [];
  const destination = {
    write: (line: string): void => {
      lines.push(JSON.parse(line) as LogLine);
    },
  };
  return { logger: pino({ level: 'info' }, destination), lines };
}
