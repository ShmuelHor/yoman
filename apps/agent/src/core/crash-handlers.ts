import type { AgentLogger } from './logger.js';

const EXIT_FAILURE = 1;

export interface CrashHandlerOptions {
  readonly logger: Pick<AgentLogger, 'fatal'>;
  readonly exit: (code: number) => void;
  readonly process: {
    on(
      event: 'unhandledRejection' | 'uncaughtException',
      listener: (reason: unknown) => void,
    ): unknown;
  };
}

/**
 * An unhandled rejection or exception leaves the agent in an unknown state, so
 * it logs once and exits non-zero for the service manager to restart. The muter
 * puts back what it changed on the next start (SPEC §4.2). Only the error's
 * class is logged: a message can carry a window title.
 */
export function installCrashHandlers(options: CrashHandlerOptions): void {
  const crash =
    (event: string) =>
    (reason: unknown): void => {
      const error = reason instanceof Error ? reason.name : typeof reason;
      options.logger.fatal({ event, error }, 'agent crashed');
      options.exit(EXIT_FAILURE);
    };
  options.process.on('unhandledRejection', crash('unhandledRejection'));
  options.process.on('uncaughtException', crash('uncaughtException'));
}
